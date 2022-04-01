// Deployment for the contract OriginERC721_v3Factory.

const hre = require('hardhat')

const deployNFT = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployerAddr, masterAddr } = await getNamedAccounts()

  console.log('Running 005_nftv3 deployment...')
  console.log('Deployer address', deployerAddr)
  console.log('Master address', masterAddr)

  const nftContractName = 'OriginERC721_v3Factory'

  await deploy(nftContractName, {
    from: deployerAddr,
    args: []
  })

  const nftContract = await hre.ethers.getContract(nftContractName)

  console.log(`${deployNFT.id} deployment done`)
  console.log(`${nftContractName} deployed to ${nftContract.address}`)

  return true
}

deployNFT.id = '005_nftv3'
deployNFT.tags = ['nft']

module.exports = deployNFT
