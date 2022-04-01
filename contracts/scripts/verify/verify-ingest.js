// Script to verify the ingest contracts.
//
// Usage:
//   export PROVIDER_URL="<key>>"
//   export HARDHAT_NETWORK=rinkeby||mainnet
//   export ETHERSCAN_API_KEY="<key>"
//   node scripts/verify-ingest.js

const hre = require('hardhat')

async function main() {
  // Verify IngestRegistry
  const registry = await hre.ethers.getContract('IngestRegistry')
  console.log('Verifying IngestRegistry at', registry.address)

  await hre.run('verify:verify', {
    address: registry.address,
    contract: 'contracts/ingest/IngestRegistry.sol:IngestRegistry',
    constructorArguments: []
  })
  console.log('Done')

  // TODO: verify IngestMidProxy. It is deployed with custom bytecode and
  //       that does not seem to be supported by hardhat-etherscan...

  // Verify IngestMaster
  const ingestMasterImpl = await hre.ethers.getContract('IngestMaster')
  console.log('Verifying IngestMaster at', ingestMasterImpl.address)

  await hre.run('verify:verify', {
    address: ingestMasterImpl.address,
    contract: 'contracts/ingest/IngestMaster.sol:IngestMaster',
    constructorArguments: []
  })
  console.log('Done')

  // Verify IngestMaster
  const ingestMasterProxy = await hre.ethers.getContract('IngestMasterProxy')
  console.log('Verifying IngestMasterProxy at', ingestMasterProxy.address)

  await hre.run('verify:verify', {
    address: ingestMasterProxy.address,
    contract: 'contracts/ingest/IngestMasterProxy.sol:IngestMasterProxy',
    constructorArguments: [ingestMasterImpl.address]
  })
  console.log('Done')

  // TODO: verify IngestImpl. It is deployed with custom bytecode and
  //       that does not seem to be supported by hardhat-etherscan...
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
