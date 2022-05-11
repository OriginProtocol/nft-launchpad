const hre = require('hardhat')

const { deployWithConfirmation } = require('../utils/deploy')

const isKovan = hre.network.name === 'kovan'
const isRinkeby = hre.network.name === 'rinkeby'
const isMainnet = hre.network.name === 'mainnet'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const deployContracts = async () => {
  console.log('Running 007_staking deployment...')
  const { deployerAddr } = await getNamedAccounts()
  const deployer = await ethers.provider.getSigner(deployerAddr)
  await deployWithConfirmation('MockOGN', [])
  const ogn = await hre.ethers.getContract('MockOGN')
  console.log(`MockOGN deployed to ${ogn.address}`)

  await deployWithConfirmation('Series', [])
  const seriesImpl = await ethers.getContract('Series')

  await deployWithConfirmation('SeriesProxy', [
    seriesImpl.address,
    ogn.address,
    ZERO_ADDRESS,
    ZERO_ADDRESS
  ])
  const seriesProxy = await ethers.getContract('SeriesProxy')
  const series = await ethers.getContractAt('Series', seriesProxy.address)
  console.log(`Series deployed to ${seriesProxy.address}`)

  await deployWithConfirmation('StOGN', [])
  const stOGNImp = await hre.ethers.getContract('StOGN')
  await deployWithConfirmation('StOGNProxy', [
    stOGNImp.address,
    ogn.address,
    series.address
  ])

  const stOGNProxy = await ethers.getContract('StOGNProxy')
  const stOGN = await hre.ethers.getContractAt('StOGN', stOGNProxy.address)
  console.log(`StOGN deployed to ${stOGNProxy.address}`)

  await series.connect(deployer).setStOGN(stOGN.address)

  await deployWithConfirmation('FeeVault', [])
  const implementation = await hre.ethers.getContract('FeeVault')

  await deployWithConfirmation('FeeVaultProxy', [
    implementation.address,
    series.address
  ])
  const feeVaultProxy = await hre.ethers.getContract('FeeVaultProxy')
  console.log(`FeeVault deployed to ${feeVaultProxy.address}`)

  await series.connect(deployer).setVault(feeVaultProxy.address)

  const block = await ethers.provider.getBlock()
  const seasonOneStartTime = block.timestamp
  const seasonOneEndTime = seasonOneStartTime + 60 * 60 * 24 * 120
  const seasonTwoStartTime = seasonOneEndTime
  const seasonTwoEndTime = seasonTwoStartTime + 60 * 60 * 24 * 120
  const claimPeriod = 60 * 60 * 24 * 45 // 45 days
  const lockPeriod = 60 * 60 * 24 * 30 // 30 days

  await deployWithConfirmation('SeasonOne', [
    series.address,
    seasonOneStartTime,
    seasonOneEndTime,
    claimPeriod,
    lockPeriod
  ])

  await deployWithConfirmation('SeasonTwo', [
    series.address,
    seasonTwoStartTime,
    seasonTwoEndTime,
    claimPeriod,
    lockPeriod
  ])

  const seasonOne = await hre.ethers.getContract('SeasonOne')
  const seasonTwo = await hre.ethers.getContract('SeasonTwo')
  console.log(`SeasonOne deployed to ${seasonOne.address}`)
  console.log(`SeasonTwo deployed to ${seasonTwo.address}`)

  // Make sure there's an active season
  await series.connect(deployer).pushSeason(seasonOne.address)

  console.log('007_staking deployment complete.')

  return true
}

deployContracts.id = '007_staking'
deployContracts.tags = ['staking']
deployContracts.skip = () => isKovan || isRinkeby || isMainnet

module.exports = deployContracts
