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

## Deployment

For any new contracts, make sure to create the necessary deploy scripts in
`deploy/`. Make sure they're compatible (or skipped) with all networks on which
we normally deploy.

When deploying to a public network, make sure to have the `DEPLOYER_PK` set with
whichever account you want to use with deployment. Usually these are burner
accounts and are not used going forward.

Here's an example command for deploying to Rinkeby:

```sh
PROVIDER_URL=https://eth-rinkeby.alchemyapi.io/v2/KEY DEPLOYER_PK=0xdeadbeef ./node_modules/.bin/hardhat --network rinkeby deploy --gasprice 30000000000 --export network.rinkeby.json
```

### Re-deployment

If you need to redeploy a contract for whatever reason, you will need to make
some manual alterations to metadata files. This is also risky if your deployment
scripts are not idempotent. **Make sure you know how the deploy script(s) will
behave before attempting this.**

1. Edit `deployments/[network_name]/.migrations.json` and remove the timestamp
   for the script you would like to re-run.
2. Remove `deployments/rinkeby/[contract_name].json` for any contracts that you
   would like redeployed.
3. Run above deployment command
