const hre = require('hardhat')

const isMainnet = hre.network.name === 'mainnet'
const isKovan = hre.network.name === 'kovan'
const isRinkeby = hre.network.name === 'rinkeby'

const deployNFT = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployerAddr, masterAddr } = await getNamedAccounts()

  console.log('Running 003_nftv2 deployment...')
  console.log('Deployer address', deployerAddr)
  console.log('Master address', masterAddr)

  const nftContractName = 'OriginERC721_v2'

  await deploy(nftContractName, {
    from: deployerAddr,
    args: ['OriginERC721_v2', 'OGNFT', 'http:///']
  })

  const nftContract = await hre.ethers.getContract(nftContractName)

  console.log(`${deployNFT.id} deployment done`)
  console.log(`${nftContractName} deployed to ${nftContract.address}`)

  return true
}

deployNFT.id = '003_nftv2'
deployNFT.tags = ['nft']
deployNFT.skip = () => isMainnet || isKovan || isRinkeby

module.exports = deployNFT
