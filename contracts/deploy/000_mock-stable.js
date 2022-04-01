const hre = require('hardhat')

const isKovan = hre.network.name === 'kovan'
const isRinkeby = hre.network.name === 'rinkeby'
const isMainnet = hre.network.name === 'mainnet'

const deployMockStable = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments
  const { deployerAddr, masterAddr } = await getNamedAccounts()

  console.log('Running 000_contracts deployment...')
  console.log('Deployer address', deployerAddr)
  console.log('Master address', masterAddr)

  const daiContractName = 'MockDAI'
  const ousdContractName = 'MockOUSD'
  const usdcContractName = 'MockUSDC'
  const usdtContractName = 'MockUSDT'

  await deploy(daiContractName, { from: deployerAddr })
  await deploy(ousdContractName, { from: deployerAddr })
  await deploy(usdcContractName, { from: deployerAddr })
  await deploy(usdtContractName, { from: deployerAddr })

  const daiContract = await hre.ethers.getContract(daiContractName)
  const ousdContract = await hre.ethers.getContract(ousdContractName)
  const usdcContract = await hre.ethers.getContract(usdcContractName)
  const usdtContract = await hre.ethers.getContract(usdtContractName)

  console.log(`${deployMockStable.id} deployment done`)
  console.log(`${daiContractName} deployed to ${daiContract.address}`)
  console.log(`${ousdContractName} deployed to ${ousdContract.address}`)
  console.log(`${usdcContractName} deployed to ${usdcContract.address}`)
  console.log(`${usdtContractName} deployed to ${usdtContract.address}`)

  return true
}

deployMockStable.id = '001_mock-stable'
deployMockStable.tags = ['mock stable']
deployMockStable.skip = () => isKovan || isRinkeby || isMainnet

module.exports = deployMockStable
