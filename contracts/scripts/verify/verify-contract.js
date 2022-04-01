// Script to verify a contract for a given network, address, and constructor args.
//
// Requirements:
//   - Set `HARDHAT_NETWORK` in .env and set your network to a known value for etherscan
//     - kovan
//     - rinkeby
//     - mainnet
//   - Set `ETHERSCAN_API_KEY` in .env
//
// Running:
//   This script verifies a deployed contract on a given --network.
//     - Pass in --network and --contractId to read from the nft_contracts table.
//        - node verify-contract.js --contractId 1 --network rinkeby --doIt
//

require('dotenv').config({ path: '../../../server/.env' })
const program = require('commander')
const { NFTContract } = require('../../../common')
const { verifyContract } = require('./utils/verify')
const {
  createNftWithContractId,
  cleanupNftWithContractId
} = require('../shared')

/**
 * Setup commander from cmd line input and returns info object needed for verification.
 * @returns {Object}
 */
async function init() {
  const HELP = `
    This script verifies a deployed contract on a given --network and --contractId
    Ex: node verify-contract.js --contractId 1 --network rinkeby --doIt`

  //Setup Commander
  program
    .requiredOption('-n, --network <string>', 'Network to verify contract on')
    .requiredOption(
      '-i, --contractId <string>',
      'Id of deployed contract in nft_contracts table'
    )
    .option(
      '-d, --doIt',
      'If flag exists verify contract. Otherwise just do a dry run.'
    )
    .addHelpText('after', HELP)

  if (!process.argv.slice(2).length) {
    program.outputHelp()
    process.exit(1)
  }

  program.parse(process.argv)
  const config = program.opts()

  if (config.help === true) {
    console.log(HELP)
    return
  }

  return await parseAndVerifyInput(config)
}

/**
 * Validates user input from cmd line and returns info object needed for verification.
 * @param {Object} config: The commander config object
 * @returns {Object}
 */
async function parseAndVerifyInput(config) {
  // for readability
  const info = {
    contractId: '',
    address: '',
    file: '',
    constructorArgs: {
      name: '',
      symbol: '',
      baseUri: ''
    },
    headerArgs: {
      name: '',
      url: ''
    },
    doIt: config.doIt,
    network: config.network
  }

  if (!config.network || config.network !== process.env.HARDHAT_NETWORK) {
    throw new Error(
      `Specified --network: ${config.network} does not match env HARDHAT_NETWORK: ${process.env.HARDHAT_NETWORK}`
    )
  }

  const nftContract = await NFTContract.findByPk(config.contractId)
  if (!nftContract) {
    throw new Error(
      `Row does not exist in nft_contracts table for given: ${config.contractId}`
    )
  }

  info.contractId = config.contractId
  info.address = nftContract.address
  info.file = nftContract.filename + '.sol'

  info.constructorArgs.name = nftContract.erc721Name
  info.constructorArgs.symbol = nftContract.erc721Symbol
  info.constructorArgs.baseUri = nftContract.erc721BaseUri

  info.headerArgs.name = nftContract.commentsArtist
  info.headerArgs.url = nftContract.commentsUrl

  return info
}

async function main() {
  const info = await init()
  await createNftWithContractId(info.contractId)
  await verifyContract(info)
  await cleanupNftWithContractId(info.contractId)
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })
