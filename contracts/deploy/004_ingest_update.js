const hre = require('hardhat')

const { placeholders } = require('../ingest.config.js')
const {
  isMainnet,
  isHardhat,
  deployWithConfirmation,
  withConfirmation,
  getTxOpts
} = require('../utils/deploy')

const deployContracts = async ({ deployments }) => {
  const { getArtifact } = deployments

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

  console.log('Running 004_ingest_update deployment...')
  const registry = await ethers.getContract('IngestRegistry')

  const highGasLimit = 1000000
  const ingestImplArtifact = await getArtifact('IngestImpl')
  const ingestImpl = await deployWithConfirmation(
    'IngestImpl',
    [],
    {
      abi: ingestImplArtifact.abi,
      bytecode: await replaceBytecodeAddress(
        ingestImplArtifact.bytecode,
        'IngestRegistry'
      )
    },
    highGasLimit
  )
  console.log('IngestImplementation deployed at', ingestImpl.address)

  if (isMainnet) {
    console.log(
      `As a next step, call setEndpointImplementation(${
        ingestImpl.address
      } on registry at ${
        registry.address
      } using the multisig wallet ${await registry.governor()}`
    )
  } else {
    console.log(
      'IngestRegistry: setting endpointImplementation to',
      ingestImpl.address
    )
    await withConfirmation(
      registry.setEndpointImplementation(
        ingestImpl.address,
        await getTxOpts(highGasLimit)
      )
    )
  }

  console.log('004_ingest_update deploy done.')
  return true
}

deployContracts.id = '004_ingest_update'
deployContracts.tags = ['ingest']
deployContracts.skip = () => isHardhat

module.exports = deployContracts
