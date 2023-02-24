const hre = require('hardhat')

const {
  THIRTY_DAYS,
  NINETY_DAYS,
  ONE_HUNDRED_TWENTY_DAYS,
  isGoerli,
  isMainnet,
  deployWithConfirmation,
  unixNow,
  withConfirmation
} = require('../utils/deploy')
const { getNamedAccounts } = require('hardhat')

const deployContracts = async () => {
  console.log('Running 010_season3 deployment...')
  const { deployerAddr } = await getNamedAccounts()
  const deployer = await ethers.provider.getSigner(deployerAddr)
  const seriesProxy = await ethers.getContract('SeriesProxy')
  const series = await ethers.getContractAt('SeriesV2', seriesProxy.address)
  const seasonTwo = await ethers.getContract('SeasonTwo')

  const seasonTwoEndTime = (await seasonTwo.endTime()).toNumber()
  const seasonThreeStartTime = seasonTwoEndTime
  const seasonThreeLockStartTime = seasonThreeStartTime + NINETY_DAYS
  const seasonThreeEndTime = seasonThreeStartTime + ONE_HUNDRED_TWENTY_DAYS
  const seasonThreeClaimEnd =
    seasonThreeStartTime + ONE_HUNDRED_TWENTY_DAYS + THIRTY_DAYS

  console.log('------------------------------------------')
  console.log('seasonThreeStartTime:', seasonThreeStartTime)
  console.log('seasonThreeLockStartTime:', seasonThreeLockStartTime)
  console.log('seasonThreeEndTime:', seasonThreeEndTime)
  console.log('seasonThreeClaimEnd:', seasonThreeClaimEnd)
  console.log('------------------------------------------')

  // Deploy SeasonThree
  await deployWithConfirmation(
    'SeasonThree',
    [
      series.address,
      seasonThreeStartTime,
      seasonThreeLockStartTime,
      seasonThreeEndTime,
      seasonThreeClaimEnd
    ],
    isMainnet || seasonThreeStartTime > unixNow()
      ? 'SeasonV2'
      : 'SeasonV2_TESTING'
  )

  const seasonThree = await hre.ethers.getContract('SeasonThree')
  console.log('SeasonThree deployed to ', seasonThree.address)

  if (isMainnet) {
    const pushTx = await series
      .connect(deployer)
      .populateTransaction.pushSeason(seasonThree.address)
    console.log('Series pushSeason() Transaction:', {
      data: pushTx.data,
      to: pushTx.to
    })
  } else if (isGoerli) {
    // Tests normally push this season when they need it, but we want to
    // push in the case of testnet deploys
    await withConfirmation(
      series.connect(deployer).pushSeason(seasonThree.address)
    )
    console.log('SeasonThree pushed to series')
  } else {
    console.log(`Network ${hre.network.name} is unsupported by this deployment`)
  }

  console.log('010_season3 deployment complete.')

  return true
}

deployContracts.id = '010_season3'
deployContracts.tags = ['staking']
// Skipping hardhat.  Seasons are mostly handled in 999 deployment
deployContracts.skip = () => !(isMainnet || isGoerli)

module.exports = deployContracts
