const hre = require('hardhat')

const deployNFT = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployerAddr, masterAddr } = await getNamedAccounts()

  console.log('Running 002_nft deployment...')
  console.log('Deployer address', deployerAddr)
  console.log('Master address', masterAddr)

  const nftContractName = 'OriginERC721_v1'

  await deploy(nftContractName, {
    from: deployerAddr,
    args: ['OriginERC721_v1', 'OGNFT', 'http:///']
  })

  const nftContract = await hre.ethers.getContract(nftContractName)

  console.log(`${deployNFT.id} deployment done`)
  console.log(`${nftContractName} deployed to ${nftContract.address}`)

  return true
}

deployNFT.id = '002_nft'
deployNFT.tags = ['nft']
// deprecated
deployNFT.skip = () => true

module.exports = deployNFT
