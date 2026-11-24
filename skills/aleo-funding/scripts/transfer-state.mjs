import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

async function save(directory, state) {
  const temporary = join(directory, `.state-${randomUUID()}.tmp`)
  const file = await open(temporary, 'wx', 0o600)
  try { await file.writeFile(`${JSON.stringify(state, null, 2)}\n`); await file.sync() } finally { await file.close() }
  await rename(temporary, join(directory, 'state.json'))
  if (process.platform !== 'win32') {
    const parent = await open(directory, 'r')
    try { await parent.sync() } finally { await parent.close() }
  }
}

async function readState(directory) {
  for (const path of [directory, join(directory, 'state.json')]) {
    const info = await lstat(path)
    if (info.isSymbolicLink() || (process.platform !== 'win32' && (info.mode & 0o077))) throw new Error('INSECURE_TRANSFER_STATE')
  }
  const state = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'))
  if (state.version !== 1) throw new Error('UNKNOWN_STATE_VERSION')
  return state
}

async function locked(directory, action) {
  const path = join(directory, 'operation.lock')
  const lock = await open(path, 'wx', 0o600)
  try { return await action() } finally { await lock.close(); await unlink(path) }
}

function summary(plan) {
  return { routeId: plan.route.id, registryVersion: plan.registryVersion, amount: plan.amountIn,
    source: { chain: plan.sourceAsset.chainId, asset: plan.sourceAsset.key },
    destination: { chain: plan.destinationAsset.chainId, asset: plan.destinationAsset.key },
    sender: plan.sender, recipient: plan.recipient, mintMode: plan.mintMode, cctp: plan.cctp }
}

async function submit(directory, state, action, invoke) {
  state.attemptedAction = action
  state.uncertain = true
  await save(directory, state) // Survives a broadcast timeout before the first SDK checkpoint.
  const onCheckpoint = async checkpoint => {
    state.checkpoint = checkpoint
    await save(directory, state)
  }
  let result
  try { result = await invoke(onCheckpoint) } catch {
    throw new Error('BRIDGE_STEP_UNRESOLVED: inspect the saved attempt before any further transaction')
  }
  // Successful SDK actions must leave a checkpoint. Otherwise keep the attempt unresolved.
  if (!state.checkpoint) throw new Error('NO_SUBMISSION_CHECKPOINT')
  state.uncertain = false
  await save(directory, state)
  return result
}

/** Call only after the displayed plan is authorized. One persistent directory per leg. */
export async function executeOnce(bridge, directory, plan, options = {}) {
  if (Object.hasOwn(options, 'plan') || Object.hasOwn(options, 'onCheckpoint')) throw new Error('RESERVED_OPTION')
  await mkdir(directory, { mode: 0o700 }) // Existing attempts cannot enter execute again.
  return locked(directory, () => submit(directory, { version: 1, intent: summary(plan) }, 'execute',
    onCheckpoint => bridge.execute({ ...options, plan, onCheckpoint })))
}

/** Recovery reads status. It never authorizes a new source or destination transaction. */
export async function inspectTransfer(bridge, directory, options = {}) {
  if (Object.hasOwn(options, 'checkpoint')) throw new Error('RESERVED_OPTION')
  const state = await readState(directory)
  if (!state.checkpoint) throw new Error('SUBMISSION_UNKNOWN: inspect the original wallet and chain before any further action')
  let progress
  try { progress = await bridge.recover({ ...options, checkpoint: state.checkpoint }) } catch {
    throw new Error('RECOVERY_UNAVAILABLE: retain the original checkpoint and inspect public service status')
  }
  return { uncertain: state.uncertain, progress }
}

/** Perform an explicitly authorized next step after fresh SDK recovery. */
export async function advanceTransfer(bridge, directory, action, options = {}) {
  if (!['resume', 'complete'].includes(action)) throw new Error('INVALID_NEXT_ACTION')
  if (['plan', 'progress', 'checkpoint', 'onCheckpoint'].some(key => Object.hasOwn(options, key))) throw new Error('RESERVED_OPTION')
  return locked(directory, async () => {
    const state = await readState(directory)
    if (!state.checkpoint) throw new Error('SUBMISSION_UNKNOWN: reconcile the prior attempt before authorizing another transaction')
    let progress
    try { progress = await bridge.recover({ checkpoint: state.checkpoint, ...(options.circle ? { circle: options.circle } : {}) }) } catch {
      throw new Error('RECOVERY_UNAVAILABLE: retain the original checkpoint and inspect public service status')
    }
    // A source call cannot have submitted a destination action. Fresh SDK recovery
    // of its saved source hash can therefore authorize only the destination step.
    const verifiedSource = action === 'complete' && progress.next === 'complete'
      && ['execute', 'resume'].includes(state.attemptedAction) && state.checkpoint.source?.transactionId
    if (state.uncertain && !verifiedSource) throw new Error('SUBMISSION_UNKNOWN: reconcile the prior attempt before authorizing another transaction')
    if (progress.next !== action) throw new Error('NEXT_ACTION_CHANGED')
    return submit(directory, state, action, onCheckpoint => bridge[action]({ ...options, progress, onCheckpoint }))
  })
}
