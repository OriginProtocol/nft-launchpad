const hre = require('hardhat')

const { placeholders } = require('../ingest.config.js')
const {
  deployWithConfirmation,
  withConfirmation,
  getTxOpts
} = require('../utils/deploy')

const isRinkeby = hre.network.name === 'rinkeby'
const isMainnet = hre.network.name === 'mainnet'

const deployContracts = async ({ getNamedAccounts, deployments }) => {
  const { getArtifact } = deployments
  const { deployerAddr } = await getNamedAccounts()
  const deployer = await ethers.provider.getSigner(deployerAddr)

  const replaceBytecodeAddress = async (bytecode, contractName) => {
    const placeholderAddress = placeholders[contractName].slice(2)
    const contractAddress = (await ethers.getContract(contractName)).address
      .slice(2)
      .toLowerCase()
    return bytecode.replace(
      new RegExp(placeholderAddress, 'g'),
      contractAddress
    )
  }

  console.log('Running 001_ingest deployment...')

  if ((isRinkeby || isMainnet) && !process.env.INGEST_POOL_ADDRESS) {
    throw new Error('INGEST_POOL_ADDRESS must be defined')
  }
  const poolAddr = process.env.INGEST_POOL_ADDRESS
  console.log('Using pool address', poolAddr)

  if ((isRinkeby || isMainnet) && !process.env.COLLECTOR_ADDRESS) {
    throw new Error('COLLECTOR_ADDRESS must be defined')
  }
  const collectorAddr = process.env.COLLECTOR_ADDRESS
  console.log('Using collector address', collectorAddr)

  if ((isRinkeby || isMainnet) && !process.env.GOVERNOR_ADDRESS) {
    throw new Error('GOVERNOR_ADDRESS must be defined')
  }
  const governorAddr = process.env.GOVERNOR_ADDRESS
  console.log('Using governor address', governorAddr)

  await deployWithConfirmation('IngestRegistry')
  const registry = await ethers.getContract('IngestRegistry')
  console.log('Registry:', registry.address)

  const midProxyArtifact = await getArtifact('IngestMidProxy')
  await deployWithConfirmation('IngestMidProxy', [], {
    abi: midProxyArtifact.abi,
    bytecode: await replaceBytecodeAddress(
      midProxyArtifact.bytecode,
      'IngestRegistry'
    )
  })
  const ingestMidProxy = await ethers.getContract('IngestMidProxy')

  const ingestMasterImpl = await deployWithConfirmation('IngestMaster')
  const ingestMasterProxy = await deployWithConfirmation('IngestMasterProxy', [
    ingestMasterImpl.address
  ])
  const ingestMaster = await ethers.getContractAt(
    'IngestMaster',
    ingestMasterProxy.address
  )

  console.log('Calling initialize on IngestMaster with', ingestMidProxy.address)
  await withConfirmation(
    ingestMaster
      .connect(deployer)
      .initialize(ingestMidProxy.address, await getTxOpts())
  )

  const ingestImplArtifact = await getArtifact('IngestImpl')
  const ingestImpl = await deployWithConfirmation('IngestImpl', [], {
    abi: ingestImplArtifact.abi,
    bytecode: await replaceBytecodeAddress(
      ingestImplArtifact.bytecode,
      'IngestRegistry'
    )
  })

  console.log('ingestMaster.address:', ingestMaster.address)
  console.log('ingestImpl.address', ingestImpl.address)

  console.log('IngestRegistry: setting master to', ingestMaster.address)
  await withConfirmation(
    registry
      .connect(deployer)
      .setMaster(ingestMaster.address, await getTxOpts())
  )

  console.log(
    'IngestRegistry: setting endpointImplementation to',
    ingestImpl.address
  )
  await withConfirmation(
    registry
      .connect(deployer)
      .setEndpointImplementation(ingestImpl.address, await getTxOpts())
  )

  if (isRinkeby || isMainnet) {
    console.log('IngestMaster: setting collector to', collectorAddr)
    await withConfirmation(
      ingestMaster
        .connect(deployer)
        .setCollector(collectorAddr, await getTxOpts())
    )

    console.log('IngestRegistry: setting pool to', poolAddr)
    await withConfirmation(
      registry.connect(deployer).setPool(poolAddr, await getTxOpts())
    )

    console.log('IngestRegistry: transferring governance to', governorAddr)
    await withConfirmation(
      registry
        .connect(deployer)
        .transferGovernance(governorAddr, await getTxOpts())
    )

    console.log('IngestMaster: transferring governance to', governorAddr)
    await withConfirmation(
      ingestMaster
        .connect(deployer)
        .transferGovernance(governorAddr, await getTxOpts())
    )
  } else {
    // on Dev use signer 8 as pool for tests
    const signerOne = await ethers.provider.getSigner(8)
    const poolAddress = await signerOne.getAddress()
    await registry.connect(deployer).setPool(poolAddress)
  }

  console.log('001_ingest deploy done.')

  return true
}

deployContracts.id = '001_ingest'
deployContracts.tags = ['ingest']

module.exports = deployContracts
