const hre = require('hardhat')

const {
  THIRTY_DAYS,
  NINETY_DAYS,
  ONE_HUNDRED_TWENTY_DAYS,
  isAggressiveTesting,
  isGoerli,
  isHardhat,
  isMainnet,
  deployWithConfirmation,
  withConfirmation
} = require('../utils/deploy')

const setupTestEnv = async () => {
  console.log('Running 999_testing deployment...')
  const { deployerAddr } = await getNamedAccounts()
  const deployer = await ethers.provider.getSigner(deployerAddr)
  if (!(isGoerli || isHardhat)) {
    return
  }
  // TODO: Move this to 999 deploy?
  if (isAggressiveTesting) {
    const feeVaultProxy = await hre.ethers.getContract('FeeVaultProxy')
    const ogn = await hre.ethers.getContract('MockOGN')
    const seriesProxy = await ethers.getContract('SeriesProxy')
    const series = await ethers.getContractAt('SeriesV2', seriesProxy.address)

    // Add 50 ETH and 50,000 OGN in rewards to FeeVault from
    // first named account to allow simulation of withdrawals.
    await deployer.sendTransaction({
      to: feeVaultProxy.address,
      value: ethers.utils.parseEther('50')
    })
    await ogn
      .connect(deployer)
      .transfer(feeVaultProxy.address, ethers.utils.parseEther('50000'))

    const finalSeasonAddress = await series.expectedClaimingSeasons()
    const finalSeason = await ethers.getContractAt(
      'SeasonV2',
      finalSeasonAddress
    )
    const finalSeasonEndTime = await finalSeason.endTime()

    // Add more seasons for aggressive timeframe testing
    let baseStartTime = finalSeasonEndTime
    let baseLockStartTime = baseStartTime + NINETY_DAYS
    let baseEndTime = baseStartTime + ONE_HUNDRED_TWENTY_DAYS
    let baseClaimEnd = baseStartTime + ONE_HUNDRED_TWENTY_DAYS + THIRTY_DAYS

    for (let i = 0; i < 10; i++) {
      await deployWithConfirmation(
        `Season ${i}`,
        [
          series.address,
          baseStartTime,
          baseLockStartTime,
          baseEndTime,
          baseClaimEnd
        ],
        'Season'
      )
      const season = await hre.ethers.getContract(`Season ${i}`)
      console.log(`Season ${i} deployed to ${season.address}`)

      baseStartTime = baseEndTime
      baseLockStartTime = baseStartTime + NINETY_DAYS
      baseEndTime = baseStartTime + ONE_HUNDRED_TWENTY_DAYS
      baseClaimEnd = baseStartTime + ONE_HUNDRED_TWENTY_DAYS + THIRTY_DAYS
    }

    // Push additional seasons
    for (let i = 0; i < 10; i++) {
      const season = await hre.ethers.getContract(`Season ${i}`)
      await withConfirmation(
        series.connect(deployer).pushSeason(season.address)
      )
    }
  }
}

setupTestEnv.id = '009_stakingv2'
setupTestEnv.tags = ['staking']
setupTestEnv.skip = () => isMainnet

module.exports = setupTestEnv
