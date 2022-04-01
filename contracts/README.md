# Contracts

## Verify contract with no deploy arguments

```sh
$(yarn bin hardhat) verify --network rinkeby CONTRACT_ADDRESS
```

## Verify contract with deploy arguments

```sh
$(yarn bin hardhat) verify --network rinkeby --constructor-args data/arguments.js CONTRACT_ADDRESS
```

## Bundle

Can create a "bundle", which is a JSON file with everything necessary to deploy
and verify a contract. Specifically, this was created for use with the NFT
contract so the server can do repeatable deployments and Etherscan
verifications.

```sh
npx hardhat bundle --contract "OriginERC721_v1" --outfile ../server
```

These JSON bundles can then be imported and used for deployment bytecode, ABI,
solc input JSON, and compiler versions.
