// Script to deploy a Polygon NFT receiver contract on the Ethereum network.
//
// TODO:
//  - As part of a Polygon NFT contract deploy, the NFT metadata gets
//  generated and stored under https://<site>/nft/<polygon_address>.
//  We should duplicate the metadata under https://<site>/nft/<ethereum_address>, otherwise
//  the NFTs exported to Ethereum won't have loadable metadata.
//  - Set a higher EIP 1559 tx priority fee based on the value of env var GAS_PRICE_MULTIPLIER.
//
// Example of a deploy on ethereum mainnet:
//   #> heroku run bash -a nft-staging
//   #> cd contracts/scripts/deploy
//   #> node deploy-receiver-nft.js \
//       --nftContractId 4 \
//       --network mainnet \
//       --dotIt

const dotenv = require('dotenv').config({ path: '../../../server/.env' })
console.log(`Using dotenv config:`, dotenv.error ? {} : dotenv)
const hre = require('hardhat')

const program = require('commander')
const ethers = require('ethers')
const { deployerPk } = require('../../../server/src/utils/accounts')
const { NFTContract } = require('../../../common')
const { Networks } = require('../../../common/src/enums')

const POLYGON_CONTRACT_NAME = 'OriginPolygonReceiverERC721_v1'

const PREDICATE_ADDR_MAINNET = '0x932532aA4c0174b8453839A6E44eE09Cc615F2b7'
const PREDICATE_ADDR_GOERLI = '0x56E14C4C1748a818a5564D33cF774c59EB3eDF59'
const PREDICATE_ROLE =
  '0x12ff340d0cd9c652c747ca35727e68c547d0f0bfa7758d2e77f75acef481b4f2'

// Setup Contract/Provider/Wallet Info
const provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL)
const wallet = new ethers.Wallet(deployerPk, provider)

//Setup Commander
program
  .requiredOption(
    '-i, --nftContractId <number>',
    'Id of the nft_contracts row in the DB',
    (nftContractId) => Number(nftContractId)
  )
  .requiredOption(
    '-n, --network <string>',
    'network name - Must be goerli or mainnet'
  )
  .option(
    '-c, --confirmations <number>',
    'number of confirmations',
    (confirmations) => Number(confirmations)
  )
  .option(
    '-d, --doIt',
    'If flag exists deploy contract and update db. Otherwise just do a dry run.'
  )

if (!process.argv.slice(2).length) {
  program.outputHelp()
  process.exit(1)
}

program.parse(process.argv)
const config = program.opts()

/**
 * Deploys the NFT receiver contract and returns its address.
 *
 * @param {Object} nftContract: NFTContract DB object
 * @param {String} network: 'goerli' or 'mainnet'
 * @param {Boolean} doIt: whether to perform action or not
 * @param {Number} numConfirmations: Number f blocks confirmation to wait for after deploy
 * @returns {Promise<String>}
 */
async function deployReceiverContract(
  nftContract,
  network,
  numConfirmations,
  doIt
) {
  const artifact = require(`common/src/artifacts/${POLYGON_CONTRACT_NAME}.json`)
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  )

  // Calculate the expected contract address and adjust the base uri accordingly
  const nonce = await provider.getTransactionCount(wallet.address)
  console.log('wallet.address:', wallet.address)
  const futureAddress = ethers.utils.getContractAddress({
    from: wallet.address,
    nonce
  })
  if (nonce === null || isNaN(nonce) || !futureAddress) {
    throw new Error('Unable to pregenerate expected contract address')
  }

  // Compute the base URI. Since a NFT contract was already deployed on Polygon,
  // it should be set in the DB to something like
  //   'https://nft.welcometokshmr.com/nft/0x1aD221bAc733d1190f2Eed6d80Ac99C6dEbf821a/'
  // Take that URI and replace the Polygon contract address with the predicted Ethereum address.
  const splits = nftContract.erc721BaseUri.split('/')
  if (splits.length !== 6) {
    throw new Error(`Unexpected base URI: ${nftContract.erc721BaseUri}`)
  }
  splits[4] = futureAddress
  const baseURI = splits.join('/')

  console.log('Contract constructor args:')
  console.log(`name:     ${nftContract.erc721Name}`)
  console.log(`symbol:   ${nftContract.erc721Symbol}`)
  console.log(`base_uri: ${baseURI}`)

  // Only deploy contract if --doIt is true
  let address = 'NA'
  const predicateAddress =
    network === 'mainnet' ? PREDICATE_ADDR_MAINNET : PREDICATE_ADDR_GOERLI

  if (doIt) {
    console.log(`Deploying contract...`)
    const contract = await factory.deploy(
      nftContract.erc721Name,
      nftContract.erc721Symbol,
      baseURI
    )
    console.log(
      `Waiting for confirmation of tx with hash ${contract.deployTransaction.hash}`
    )
    await contract.deployTransaction.wait(config.numConfirmations)
    console.log(`Contract deployed at ${contract.address}`)
    address = contract.address

    console.log(
      `Granting permission for predicate roll. Using address ${predicateAddress}`
    )
    const tx = await contract.grantRole(PREDICATE_ROLE, predicateAddress)
    console.log(`Waiting for confirmation of tx with hash ${tx.hash}`)
    await tx.wait(numConfirmations)
    console.log('Predicate role granted')

    if (process.env.ETHERSCAN_API_KEY) {
      console.log('verifying contract...', address)
      const contractName = `contracts/nft/${POLYGON_CONTRACT_NAME}.sol:${POLYGON_CONTRACT_NAME}`
      const constructorArguments = [
        nftContract.erc721Name,
        nftContract.erc721Symbol,
        baseURI
      ]
      await hre.run('verify:verify', {
        address,
        contract: contractName,
        constructorArguments
      })
    }
  } else {
    console.log(`Would have deployed contract at ${futureAddress}.`)
    console.log(`Would have granted role using address ${predicateAddress}`)
  }

  return address
}

/**
 * Entry method.
 * @returns {void}
 */
async function main() {
  console.log('\n**********')

  const numConfirmations = config.confirmations || 2
  console.log(`Using ${numConfirmations} confirmations`)

  if (!['goerli', 'mainnet'].includes(config.network)) {
    throw new Error(
      `Invalid network ${config.network} - Only goerly and mainnet supported`
    )
  }

  // Load the contract data from the DB.
  const nftContract = await NFTContract.findByPk(config.nftContractId)
  if (!nftContract) {
    throw new Error(
      `No row in the nft_contracts table with id ${config.nftContractId}`
    )
  }

  // Check the contract is on the Polygon network and was deployed.
  if (nftContract.network !== Networks.Polygon) {
    throw new Error('NFT contract is not on the Polygon network')
  }
  if (!nftContract.address) {
    throw new Error('NFT contract not deployed')
  }

  // Deploy the contract on-chain.
  const address = await deployReceiverContract(
    nftContract,
    config.network,
    numConfirmations,
    config.doIt
  )

  console.log('\n**********')
  console.log('Receiver contract deployed:', address)
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })
