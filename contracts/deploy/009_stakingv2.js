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
  unixNow,
  withConfirmation
} = require('../utils/deploy')
const { getNamedAccounts } = require('hardhat')

const ONE_ADDRESS = '0x0000000000000000000000000000000000000001'

const deployContracts = async () => {
  console.log('Running 009_stakingv2 deployment...')
  const { deployerAddr } = await getNamedAccounts()
  const deployer = await ethers.provider.getSigner(deployerAddr)
  const seasonOne = await hre.ethers.getContract('SeasonOne')
  const seriesProxy = await ethers.getContract('SeriesProxy')

  // Deploy new Series V2 implementation
  await deployWithConfirmation('SeriesV2', [])
  const seriesImpl = await ethers.getContract('SeriesV2')

  // Init the implementation to prevent third-party fiddling
  await seriesImpl.connect(deployer).initialize(ONE_ADDRESS, ONE_ADDRESS)

  const series = await ethers.getContractAt('SeriesV2', seriesProxy.address)
  console.log('SeriesV2 implementation deployed to:', seriesImpl.address)

  const seasonOneEndTime = (await seasonOne.endTime()).toNumber()
  const seasonOneClaimEndTime = (await seasonOne.claimEndTime()).toNumber()
  const seasonTwoStartTime = seasonOneEndTime
  const seasonTwoLockStartTime = seasonTwoStartTime + NINETY_DAYS
  const seasonTwoEndTime = seasonTwoStartTime + ONE_HUNDRED_TWENTY_DAYS
  const seasonTwoClaimEnd =
    seasonTwoStartTime + ONE_HUNDRED_TWENTY_DAYS + THIRTY_DAYS

  console.log('------------------------------------------')
  console.log('series.seasons(0):', await series.seasons(0))
  /*console.log('series.seasons(1):', await series.seasons(1))
  console.log('series.seasons(2):', await series.seasons(2))*/
  console.log('seasonTwoStartTime:', seasonTwoStartTime)
  console.log('seasonTwoLockStartTime:', seasonTwoLockStartTime)
  console.log('seasonTwoEndTime:', seasonTwoEndTime)
  console.log('seasonTwoClaimEnd:', seasonTwoClaimEnd)
  console.log('seasonOneClaimEndTime:', seasonOneClaimEndTime)
  console.log('seasonTwoEndTime:', seasonTwoEndTime)
  console.log(
    `${seasonTwoEndTime} > ${seasonOneClaimEndTime} == ${
      seasonTwoEndTime > seasonOneClaimEndTime
    }`
  )
  console.log('------------------------------------------')

  // Deploy SeasonTwo
  await deployWithConfirmation(
    'SeasonTwo',
    [
      series.address,
      seasonTwoStartTime,
      seasonTwoLockStartTime,
      seasonTwoEndTime,
      seasonTwoClaimEnd
    ],
    isMainnet || seasonTwoStartTime > unixNow()
      ? 'SeasonV2'
      : 'SeasonV2_TESTING'
  )

  const seasonTwo = await hre.ethers.getContract('SeasonTwo')
  console.log('SeasonTwo deployed to ', seasonTwo.address)

  if (isMainnet) {
    // Build upgrade and push transactions for multisig
    const tx = await seriesProxy
      .connect(deployer)
      .populateTransaction.upgradeTo(seriesImpl.address)
    console.log('SeriesProxy upgradeTo() Transaction:', {
      data: tx.data,
      to: tx.to
    })

    const pushTx = await series
      .connect(deployer)
      .populateTransaction.pushSeason(seasonTwo.address)
    console.log('Series pushSeason() Transaction:', {
      data: pushTx.data,
      to: pushTx.to
    })
  } else if (isGoerli || isHardhat) {
    // Upgrade Series
    await withConfirmation(
      seriesProxy.connect(deployer).upgradeTo(seriesImpl.address)
    )

    console.log(
      'Series upgrade to implementation @ ',
      await seriesProxy.implementation()
    )

    if (!isHardhat) {
      // Tests normally push this season when they need it, but we want to
      // push in the case of testnet deploys
      await withConfirmation(
        series.connect(deployer).pushSeason(seasonTwo.address)
      )
      console.log('SeasonTwo pushed to season')
    }

    // TODO: Move this to 999 deploy?
    if (isAggressiveTesting) {
      const feeVaultProxy = await hre.ethers.getContract('FeeVaultProxy')
      const ogn = await hre.ethers.getContract('MockOGN')

      // Add 50 ETH and 50,000 OGN in rewards to FeeVault from
      // first named account to allow simulation of withdrawals.
      await deployer.sendTransaction({
        to: feeVaultProxy.address,
        value: ethers.utils.parseEther('50')
      })
      await ogn
        .connect(deployer)
        .transfer(feeVaultProxy.address, ethers.utils.parseEther('50000'))

      // Add more seasons for aggressive timeframe testing
      let baseStartTime = seasonTwoEndTime
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
          isMainnet || baseStartTime > unixNow()
            ? 'SeasonV2'
            : 'SeasonV2_TESTING'
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
  } else {
    console.log(`Network ${hre.network.name} is unsupported by this deployment`)
  }

  console.log('009_stakingv2 deployment complete.')

  return true
}

deployContracts.id = '009_stakingv2'
deployContracts.tags = ['staking']
// TODO: Need to figure this one out
deployContracts.skip = () => !(isMainnet || isGoerli || isHardhat)

module.exports = deployContracts
