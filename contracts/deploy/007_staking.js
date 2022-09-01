const hre = require('hardhat')

const { deployWithConfirmation, withConfirmation } = require('../utils/deploy')
const { getNamedAccounts } = require('hardhat')

const isTest = hre.network.name === 'hardhat'
const isMainnet = hre.network.name === 'mainnet'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ONE_DAY = 60 * 60 * 24
const THIRTY_DAYS = ONE_DAY * 30
const NINETY_DAYS = ONE_DAY * 90
const ONE_HUNDRED_TWENTY_DAYS = ONE_DAY * 120

const deployContracts = async () => {
  console.log('Running 007_staking deployment...')
  const { deployerAddr } = await getNamedAccounts()
  const deployer = await ethers.provider.getSigner(deployerAddr)

  let ognAddress,
    governor = ''
  if (isMainnet) {
    ognAddress = '0x8207c1FfC5B6804F6024322CcF34F29c3541Ae26'
    // 5 of 8 multisig
    governor = '0xbe2AB3d3d8F6a32b96414ebbd865dBD276d3d899'
  } else {
    await deployWithConfirmation('MockOGN', [])
    ognAddress = (await hre.ethers.getContract('MockOGN')).address
    console.log(`MockOGN deployed to ${ognAddress}`)
  }

  await deployWithConfirmation('FeeVault', [])
  const feeVaultImpl = await hre.ethers.getContract('FeeVault')

  await deployWithConfirmation('FeeVaultProxy', [
    feeVaultImpl.address,
    ZERO_ADDRESS
  ])
  const feeVaultProxy = await hre.ethers.getContract('FeeVaultProxy')
  const feeVault = await hre.ethers.getContractAt(
    'FeeVault',
    feeVaultProxy.address
  )
  console.log(`FeeVault deployed to ${feeVaultProxy.address}`)

  await deployWithConfirmation('Series', [])
  const seriesImpl = await ethers.getContract('Series')

  await deployWithConfirmation('SeriesProxy', [
    seriesImpl.address,
    ognAddress,
    feeVaultProxy.address
  ])
  const seriesProxy = await ethers.getContract('SeriesProxy')
  const series = await ethers.getContractAt('Series', seriesProxy.address)
  console.log(`Series deployed to ${seriesProxy.address}`)

  // Introductions
  if ((await series.vault()) != feeVaultProxy.address) {
    await withConfirmation(
      series.connect(deployer).setVault(feeVaultProxy.address)
    )
  }
  if ((await feeVault.controller()) != series.address) {
    await withConfirmation(
      feeVault.connect(deployer).setController(series.address)
    )
  }

  if (isTest) {
    // Add OGN to named accounts.
    const ogn = await hre.ethers.getContract('MockOGN')
    const namedAccounts = await getNamedAccounts()
    for (const address of Object.values(namedAccounts)) {
      await ogn
        .connect(deployer)
        .mint(address, ethers.utils.parseEther('1000000'))
    }
  }

  const block = await ethers.provider.getBlock()
  // Mainnet SeasonOne starts on 2022-07-12 00:00:00 UTC
  const seasonOneStartTime = isMainnet ? 1657584000 : block.timestamp + ONE_DAY
  const seasonOneLockStartTime = seasonOneStartTime + NINETY_DAYS
  const seasonOneEndTime = seasonOneStartTime + ONE_HUNDRED_TWENTY_DAYS
  const seasonOneClaimEnd =
    seasonOneStartTime + ONE_HUNDRED_TWENTY_DAYS + THIRTY_DAYS

  await deployWithConfirmation(
    'SeasonOne',
    [
      series.address,
      seasonOneStartTime,
      seasonOneLockStartTime,
      seasonOneEndTime,
      seasonOneClaimEnd
    ],
    'Season'
  )

  const seasonOne = await hre.ethers.getContract('SeasonOne')
  console.log(`SeasonOne deployed to ${seasonOne.address}`)

  if (isTest) {
    const seasonTwoStartTime = seasonOneEndTime
    const seasonTwoLockStartTime = seasonTwoStartTime + NINETY_DAYS
    const seasonTwoEndTime = seasonTwoStartTime + ONE_HUNDRED_TWENTY_DAYS
    const seasonTwoClaimEnd =
      seasonTwoStartTime + ONE_HUNDRED_TWENTY_DAYS + THIRTY_DAYS

    await deployWithConfirmation(
      'SeasonTwo',
      [
        series.address,
        seasonTwoStartTime,
        seasonTwoLockStartTime,
        seasonTwoEndTime,
        seasonTwoClaimEnd
      ],
      'Season'
    )
    const seasonTwo = await hre.ethers.getContract('SeasonTwo')
    console.log(`SeasonTwo deployed to ${seasonTwo.address}`)
  }

  // Make sure there's an active season
  await withConfirmation(series.connect(deployer).pushSeason(seasonOne.address))

  if (governor != '') {
    await withConfirmation(
      feeVault.connect(deployer).transferGovernance(governor)
    )
    await withConfirmation(
      series.connect(deployer).transferGovernance(governor)
    )
  }

  console.log('007_staking deployment complete.')

  return true
}

deployContracts.id = '007_staking'
deployContracts.tags = ['staking']

module.exports = deployContracts
