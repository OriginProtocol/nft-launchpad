const hre = require('hardhat')

const { withConfirmation } = require('../utils/deploy')
const { getNamedAccounts } = require('hardhat')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ONE_ADDRESS = '0x0000000000000000000000000000000000000001'

const deployContracts = async () => {
  console.log('Running 008_init_implementations deployment...')
  const { deployerAddr } = await getNamedAccounts()
  const deployer = await ethers.provider.getSigner(deployerAddr)

  const feeVaultImpl = await hre.ethers.getContract('FeeVault')
  const seriesImpl = await hre.ethers.getContract('Series')

  // Init the implementations to prevent confusion
  if ((await feeVaultImpl.controller()) === ZERO_ADDRESS) {
    console.log('initizlising the FeeVault implementation')

    await withConfirmation(
      feeVaultImpl.connect(deployer).initialize(ONE_ADDRESS)
    )
  }
  if ((await seriesImpl.ogn()) === ZERO_ADDRESS) {
    console.log('initizlising the Series implementation')

    await withConfirmation(
      seriesImpl.connect(deployer).initialize(ONE_ADDRESS, ONE_ADDRESS)
    )
  }

  console.log('008_init_implementations deployment complete.')

  return true
}

deployContracts.id = '008_init_implementations'
deployContracts.tags = ['staking']

module.exports = deployContracts
