# Install or upgrade SDKs and CLIs

Use the latest published SDKs and CLI for the selected interface when setting up or updating a project. The commands below install missing packages and upgrade existing installations. Run application commands in the consuming project, outside the installed skill, and Python commands in its active virtual environment.

## TypeScript / Veil

```sh
npm install @provablehq/veil-aleo-sdk@latest @provablehq/shield-swap-sdk@latest
npm ls @provablehq/veil-aleo-sdk @provablehq/shield-swap-sdk
```

Use `@latest` for any additional Veil packages the application imports directly. Follow the [TypeScript guide](typescript.md) for the client and runtime that match the signer.

## Shield Swap CLI

For the global executable:

```sh
npm install --global @provablehq/shield-swap-cli@latest
npm ls --global @provablehq/shield-swap-cli
shield-swap --help
```

For [CLI session imports](cli.md#reuse-a-cli-account-from-a-script), install or upgrade the packages in the application too:

```sh
npm install @provablehq/shield-swap-cli@latest @provablehq/shield-swap-sdk@latest
npm ls @provablehq/shield-swap-cli @provablehq/shield-swap-sdk
```

## Python

```sh
python -m pip install --upgrade shield-swap-sdk aleo-sdk
python -m pip show shield-swap-sdk aleo-sdk
```

For the Python MCP server, use `python -m pip install --upgrade 'shield-swap-sdk[mcp]' aleo-sdk` instead. Follow the [Python guide](python.md) for environment setup and [MCP guide](mcp.md#existing-python-server) before launching a signing server.

## AgentKit MCP

The standalone server is private and unpublished. Follow its [SDK update and build commands](../../mcp/README.md#run-from-this-repository), then rebuild and reinstall the tarball used by the host. For an existing remote connection, updates belong to the server operator; installing packages in the agent's project does not update that server.

## Keep the selected setup

Record the resolved versions and retain the updated lockfile or requirements file for repeatable deployments. Version numbers in the [source map](../../docs/source-map.md) and validation reports describe past checks; use the install commands above to select current releases. Check the installed package's reference and run the consuming project's checks after an upgrade.

Keep the account, network, signer, state directory, and durable recovery material. Installation is separate from account setup and trading. A read-only inspection or recovery of an unknown operation should continue on the existing setup; updating a package never authorizes another submission.
