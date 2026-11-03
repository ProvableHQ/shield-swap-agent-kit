# Concurrent MCP testnet validation — 2026-11-03

An independently installed MCP tarball ran 14 authorized testnet swaps from one account: seven 0.1 USDCx → ETH and seven 0.0001 ETH → USDCx, each with a distinct quote and 50 bps slippage. The server used Veil 0.16.1, SDK 0.13.0 and requested FeeMaster sponsorship.

Both assets started with exactly 10 unreserved covering records. Their inventory preparations ran concurrently: 10 USDCx join/split transactions and 13 ETH transactions, all confirmed. Fourteen execute requests registered within 72 ms; polling observed all 14 operations running together. The durable journal and identity store show 14 distinct input records, 14 distinct blinded-identity counters and 14 distinct quote IDs.

| Direction | Requested | Accepted and claimed | Rejected |
| --- | ---: | ---: | ---: |
| 0.1 USDCx → ETH | 7 | 7 | 0 |
| 0.0001 ETH → USDCx | 7 | 5 | 2 |

Every accepted swap produced a nonzero output and was claimed with zero input refund. The two ETH submissions were definitively rejected on chain; the confirmed-transaction response does not expose the rejection reason. No replacement swap was submitted. The final journal has zero unresolved entries, and both assets have zero reserved records.

| Private asset | Starting base units | Sold | Received | Final base units |
| --- | ---: | ---: | ---: | ---: |
| USDCx | 127392508 | 700000 | 1121063 | 127813571 |
| ETH | 2180830492163962 | 500000000000000 | 354504187423531 | 2035334679587493 |

USDCx uses 6 decimals; ETH uses 18. Final scanner balances exactly match accepted inputs and claimed outputs. Final record counts are 15 USDCx and 17 ETH because swaps and claims produce change and output records.

## Transactions

Links open the public testnet confirmed-transaction API. Rejected swap links retain the original execution ID; the response also contains its fee transaction.

| Leg | Outcome | Swap | Claim |
| --- | --- | --- | --- |
| USDCx 1 | claimed | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1uu8crz47n8mvr0zdzjrtwpeqzzz3wehjmn9rj8vl7lh3xkzj3yqqa2jfdj) | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1gay4pa87zxtgfqz22pnzysw6x0nwch4fgc2dvjhjfeq6xp68ggzqc33c8x) |
| USDCx 2 | claimed | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1gy5h24k6yj460slcxqgnmfyzncj5r882n72kv7y52mvv8qxxn5rsryfl9t) | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at126jfvgn9gf2w5w4k44zj0505qkjcyhzurrqxvmnker4van7neugqhalea3) |
| USDCx 3 | claimed | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at145rpqym5gafvtt66hsfwquuzummq6y3r8whk4uffjzfrvjryvcgs44lcg5) | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1gl2r6nqc6c07gkkjkn6qeffmmstvjnt2unha5fcdgwn3s5u9egyq5k060y) |
| USDCx 4 | claimed | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1vkhfxg763gz09yug43c2w92atsfcxt336h5yu0dac4j6828ld5pqe9f4cf) | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1lfrj8p8mluha4dqt2x0xvjnrgh9tw8wskwumqy9aw6dasdhrhg9qhrdawf) |
| USDCx 5 | claimed | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at198hnffvnnyh67f3zfq424qhvq0wy3a8prz877tx3k0950jdmf5ysxvx82m) | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1hkuh3nj5hk365t287sxw9kdxnn33mnlmp8kav3emvwkmskp7mcpsg9yu3z) |
| USDCx 6 | claimed | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at15srvrwgykalz7gl4zn4lh623a7fje79jek6vt6dq8gs7y6wagcxqshqj6r) | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1jfhfmrgrtxsyedkamxnygcl0vzf69qqdqwa89f0n4xspeffxw58qq90uw5) |
| USDCx 7 | claimed | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at10q7r9e49lzj8uqnyzudsnef2knp0kcfwevys8juc79zwwtdj4ygqut45ug) | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at13m8vgrwvtr3r5cm9993ayhftsp7l4rh3kns4t6uldxnvm3a83ggqndqplp) |
| ETH 1 | claimed | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1xjhc3pspvwegktz8gkjl29ssgvgmgqznuuuh63mznfjqz2kjrcyqat5mwd) | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1sxnvwlemestrzwckmk9r9zyqv58rxx3s3nkx0q8jcqh980yaqq9sjk4vq0) |
| ETH 2 | claimed | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1j3pvhwlmszlffj5dclt8lkf8jqcltkc6qr8ln47zt67vwmfvjgzsqghakf) | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1g9v7tu4aqwsx3l6pctrmfvgd624k3349y6cxm97ahcxkutdscs9ssmrcgz) |
| ETH 3 | rejected | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1llsugnntps9eugmtaf3azppr0k7gwhl8smyl4tt6wmc7cvaksv9sf2h0aj) | — |
| ETH 4 | claimed | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1xzxwmlvh25rk73pw50jg74yvklfwyhylxaf48kypu52zlywvdu9smzf0vr) | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1392vcd67tt4h0ww3t35f2ard388sv3pp20rhk0wfz9659vagxgfqcdymr3) |
| ETH 5 | rejected | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1py7rqnm0lw8tk953qg44ut4fgjctg32w6u7u223dex8jh9l5l5ys3xswkz) | — |
| ETH 6 | claimed | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1cwny7ve76u7gxffytr7yvmc36sy87mtyayn92tjwk7hpn4zhqv9qvtyrnj) | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1nxk9veh0ta423xwc4mpwerc9a8vcnwjpazm2trfv6e9zfw3uluyq6j48n2) |
| ETH 7 | claimed | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1vq0msgl2jxwg735ekyk0n0vz72dez9k7vtknnf7j0gdh7upflqpqqdgcjt) | [transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at16fa457prlww4ctpg5kq8v0h2amk7qtgvef6r7u5ct9ldllkt0srs0px5sz) |

## Findings and limits

The live test exposed and reproduced two integration issues before delivery. Inventory joins/splits use the SDK's `writeContract` path, so progress now follows durable journal updates as well as `executeContract`. Account-wide history scans delayed ordinary status and claim bookkeeping; status now checks direct output and local claim evidence first, recognizes active claims, and scopes SDK recovery to the affected identities while holding the shared identity lock. Regression tests cover these cases. Existing operations and claims were recovered across server restarts without submitting replacement swaps.

The final installed CLI SHA-256 was `136ccd064ca29daddf90b8467daf57ad840f3fe7a526b46727565f56392b46ce`. The swaps ran before the status/recovery fixes; final claim recovery and balance verification used this build. This was a single-account testnet exercise, not a throughput guarantee or a 14/14 success result. Recurring worker replenishment and saved-proof rebroadcast were not exercised on chain; their coordination and failure paths have offline coverage. No recurring maintenance job was enabled by this test.
