// Deployment for the contract OriginERC721_v3Factory.

const hre = require('hardhat')

const deployNFT = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployerAddr, masterAddr } = await getNamedAccounts()

  console.log('Running 006_nftv4 deployment...')
  console.log('Deployer address', deployerAddr)
  console.log('Master address', masterAddr)

  const nftContractName = 'OriginERC721_v4Factory'

  await deploy(nftContractName, {
    from: deployerAddr,
    args: []
  })

  const nftContract = await hre.ethers.getContract(nftContractName)

  console.log(`${deployNFT.id} deployment done`)
  console.log(`${nftContractName} deployed to ${nftContract.address}`)

  return true
}

deployNFT.id = '006_nftv4'
deployNFT.tags = ['nft']
// deprecated
deployNFT.skip = () => true

module.exports = deployNFT
