const hre = require('hardhat')

const {
  deployWithConfirmation,
  isMainnet,
  isRinkeby
} = require('../utils/deploy')

const deployMockStable = async ({ getNamedAccounts }) => {
  const { deployerAddr, masterAddr } = await getNamedAccounts()

  console.log('Running 000_contracts deployment...')
  console.log('Deployer address', deployerAddr)
  console.log('Master address', masterAddr)

  const daiContractName = 'MockDAI'
  const ousdContractName = 'MockOUSD'
  const usdcContractName = 'MockUSDC'
  const usdtContractName = 'MockUSDT'

  await deployWithConfirmation(daiContractName)
  await deployWithConfirmation(ousdContractName)
  await deployWithConfirmation(usdcContractName)
  await deployWithConfirmation(usdtContractName)

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
deployMockStable.skip = () => isMainnet || isRinkeby

module.exports = deployMockStable
