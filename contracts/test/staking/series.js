const { expect } = require('chai')

const { deployWithConfirmation } = require('../../utils/deploy')
const { stakingFixture } = require('../_fixture')
const {
  ONE_ETH,
  ONE_THOUSAND_OGN,
  ZERO_ADDRESS,
  blockStamp,
  expectSuccess,
  loadFixture,
  mineBlocks,
  mineUntilTime,
  randomAddress,
  rollback,
  snapshot
} = require('../helpers')

// Tests for series that don't fit within general staking tests
describe('Series', () => {
  let fixture, snapshotID

  before(async function () {
    await deployments.fixture()

    fixture = await loadFixture(stakingFixture)
  })

  beforeEach(async function () {
    snapshotID = await snapshot()
  })

  afterEach(async function () {
    await rollback(snapshotID)
  })

  it('can not initialize with zero address OGN', async function () {
    await deployWithConfirmation('ZeroOGNSeries', [], 'Series')
    const seriesImpl = await ethers.getContract('ZeroOGNSeries')

    await expect(
      deployWithConfirmation(
        'ZeroOGNSeriesProxy',
        [seriesImpl.address, ZERO_ADDRESS, fixture.feeVault.address],
        'SeriesProxy'
      )
    ).to.revertedWith('Series: Zero address: OGN')
  })

  it('can not initialize with zero address Vault', async function () {
    await deployWithConfirmation('ZeroVaultSeries', [], 'Series')
    const seriesImpl = await ethers.getContract('ZeroVaultSeries')

    await expect(
      deployWithConfirmation(
        'ZeroVaultSeriesProxy',
        [seriesImpl.address, fixture.mockOGN.address, ZERO_ADDRESS],
        'SeriesProxy'
      )
    ).to.revertedWith('Series: Zero address: Vault')
  })

  it('can not stake with zero amount', async function () {
    await expect(fixture.series.stake(0)).to.revertedWith(
      'Series: No stake amount'
    )
  })

  it('can not stake without token approval', async function () {
    const user = fixture.users.alice
    //await fixture.userStake(user)

    await deployWithConfirmation('MockOGNFail1', [], 'MockOGNFail')
    const ogn = await ethers.getContract('MockOGNFail1')

    // Switch OGN to the reverting contract for test purposes
    await expectSuccess(fixture.series.setOGN(ogn.address))

    // This is the behavior of the mock contract.  Real OGN would revert
    // without a reason.
    await expect(
      fixture.series.connect(user.signer).stake(ONE_THOUSAND_OGN)
    ).to.revertedWith('Series: OGN transfer failed')
  })

  it('can not unstake when OGN reverts', async function () {
    const user = fixture.users.alice
    await fixture.userStake(user)

    await deployWithConfirmation('MockOGNFail2', [], 'MockOGNFail')
    const ogn = await ethers.getContract('MockOGNFail2')

    // Switch OGN to the reverting contract for test purposes
    await expectSuccess(fixture.series.setOGN(ogn.address))

    // This is the behavior of the mock contract.  Real OGN would revert
    // without a reason.
    await expect(fixture.series.connect(user.signer).unstake()).to.revertedWith(
      'Series: OGN transfer failed'
    )
  })

  it('can not set OGN implementation to zero address', async function () {
    await expect(fixture.series.setOGN(ZERO_ADDRESS)).to.be.revertedWith(
      'Series: Zero address: OGN'
    )
  })

  it('can set Vault address', async function () {
    await expectSuccess(fixture.series.setVault(randomAddress()))
  })

  it('can not set Vault address to zero address', async function () {
    await expect(fixture.series.setVault(ZERO_ADDRESS)).to.be.revertedWith(
      'Series: Zero address: FeeVault'
    )
  })

  it('can set OGN implementation', async function () {
    const fakeOGN = await fixture.deployer.getAddress()
    expect(await fixture.series.ogn()).to.equal(fixture.mockOGN.address)
    await expectSuccess(fixture.series.setOGN(fakeOGN))
    expect(await fixture.series.ogn()).to.equal(fakeOGN)
  })

  it('can not remove a season when there are no seasons', async function () {
    await deployWithConfirmation('TestSeries', [], 'Series')
    const seriesImpl = await ethers.getContract('TestSeries')

    await deployWithConfirmation(
      'TestSeriesProxy',
      [seriesImpl.address, fixture.mockOGN.address, fixture.feeVault.address],
      'SeriesProxy'
    )
    const seriesProxy = await ethers.getContract('TestSeriesProxy')
    const series = await ethers.getContractAt('Series', seriesProxy.address)

    await expect(series.popSeason()).to.be.revertedWith(
      'Series: No seasons to cancel'
    )
  })

  it('can not stake/unstake/claim without a season', async function () {
    await deployWithConfirmation('NoSeasonSeries', [], 'Series')
    const seriesImpl = await ethers.getContract('NoSeasonSeries')

    await deployWithConfirmation(
      'NoSeasonSeriesProxy',
      [seriesImpl.address, fixture.mockOGN.address, fixture.feeVault.address],
      'SeriesProxy'
    )
    const seriesProxy = await ethers.getContract('NoSeasonSeriesProxy')
    const series = await ethers.getContractAt('Series', seriesProxy.address)

    await expect(series.stake(ONE_ETH)).to.be.revertedWith(
      'Series: No active season'
    )
    await expect(series.unstake()).to.be.revertedWith(
      'Series: No active season'
    )
    await expect(series.claim()).to.be.revertedWith('Series: No active season')
  })

  it('can not remove an active season', async function () {
    await expect(fixture.series.popSeason()).to.be.revertedWith(
      'Series: Season is active'
    )
  })

  it('can not add an EOA season', async function () {
    const eoa = randomAddress()
    await expect(fixture.series.pushSeason(eoa)).to.be.revertedWith(
      'Series: Season not a contract'
    )
  })

  it('can add and remove a season', async function () {
    const startTime = await fixture.seasonOne.endTime()
    const lockStartTime = startTime + 200
    const endTime = startTime + 300
    const claimEndTime = startTime + 400

    await deployWithConfirmation(
      'SeasonTwo',
      [fixture.series.address, startTime, lockStartTime, endTime, claimEndTime],
      'Season'
    )
    const seasonTwo = await ethers.getContract('SeasonTwo')

    const receipt = await expectSuccess(
      fixture.series.pushSeason(seasonTwo.address)
    )
    const newSeasonEvs = receipt.events.filter((ev) => ev.event == 'NewSeason')
    expect(newSeasonEvs).to.have.lengthOf(1)
    expect(newSeasonEvs[0].args.number).to.equal(1)
    expect(newSeasonEvs[0].args.season).to.equal(seasonTwo.address)

    expect(await fixture.series.seasons(1)).to.equal(seasonTwo.address)

    const cancelReceipt = await expectSuccess(fixture.series.popSeason())
    const cancelEvs = cancelReceipt.events.filter(
      (ev) => ev.event == 'SeasonCancelled'
    )
    expect(cancelEvs).to.have.lengthOf(1)
    expect(cancelEvs[0].args.season).to.equal(seasonTwo.address)

    // Season in index 1 should now be gone
    await expect(fixture.series.seasons(1)).to.be.reverted
  })

  it('can not add a season with an invalid end time', async function () {
    // End time needs to be after claimEndTime of the previous season
    const startTime = (await fixture.seasonOne.claimEndTime()) - 800
    const lockStartTime = startTime + 200
    const endTime = startTime + 300
    const claimEndTime = startTime + 400

    await deployWithConfirmation(
      'InvalidEndTimeSeason',
      [fixture.series.address, startTime, lockStartTime, endTime, claimEndTime],
      'Season'
    )
    const seasonTwo = await ethers.getContract('InvalidEndTimeSeason')

    await expect(
      fixture.series.pushSeason(seasonTwo.address)
    ).to.be.revertedWith('Series: Invalid end time')
  })

  it('can not add a season with a start time before previous lock', async function () {
    // Start time needs to be after lock start and end time of the previous
    const startTime = (await fixture.seasonOne.lockStartTime()) - 2
    const lockStartTime = startTime + 200
    const endTime = (await fixture.seasonOne.claimEndTime()) + 300
    const claimEndTime = endTime + 400

    await deployWithConfirmation(
      'InvalidStartTimeSeason1',
      [fixture.series.address, startTime, lockStartTime, endTime, claimEndTime],
      'Season'
    )
    const seasonTwo = await ethers.getContract('InvalidStartTimeSeason1')

    await expect(
      fixture.series.pushSeason(seasonTwo.address)
    ).to.be.revertedWith('Series: Invalid start time')
  })

  it('can not add a season with a start time before previous end', async function () {
    // Start time needs to be after lock start and end time of the previous
    const startTime = (await fixture.seasonOne.endTime()) - 2
    const lockStartTime = startTime + 200
    const endTime = (await fixture.seasonOne.claimEndTime()) + 300
    const claimEndTime = endTime + 400

    await deployWithConfirmation(
      'InvalidStartTimeSeason2',
      [fixture.series.address, startTime, lockStartTime, endTime, claimEndTime],
      'Season'
    )
    const seasonTwo = await ethers.getContract('InvalidStartTimeSeason2')

    await expect(
      fixture.series.pushSeason(seasonTwo.address)
    ).to.be.revertedWith('Series: Invalid start time')
  })

  it('should return the live season (first season)', async function () {
    expect(await fixture.series.liveSeason()).to.equal(0)
  })

  it('should return the live season (first season)', async function () {
    expect(await fixture.series.liveSeason()).to.equal(0)
  })

  it('should return the live season (first season, no advance)', async function () {
    await fixture.series.pushSeason(fixture.seasonTwo.address)

    await mineUntilTime(await fixture.seasonOne.endTime())

    expect(await fixture.series.liveSeason()).to.equal(1)
  })

  it('should return the live season (second season, advanced)', async function () {
    await fixture.series.pushSeason(fixture.seasonTwo.address)

    await mineUntilTime(await fixture.seasonOne.endTime())
    await fixture.userStake(fixture.users.alice)

    expect(await fixture.series.liveSeason()).to.equal(1)
  })

  it('should return the live season (third season, partial advance)', async function () {
    await fixture.series.pushSeason(fixture.seasonTwo.address)

    // Deploy a SeasonThree to make sure expected doesn't skip ahead
    const startTime = await fixture.seasonTwo.endTime()
    const lockStartTime = startTime + 200
    const endTime = (await fixture.seasonTwo.claimEndTime()) + 300
    const claimEndTime = endTime + 400
    await deployWithConfirmation(
      'SeasonThreeLive',
      [fixture.series.address, startTime, lockStartTime, endTime, claimEndTime],
      'Season'
    )
    const seasonThree = await ethers.getContract('SeasonThreeLive')
    await fixture.series.pushSeason(seasonThree.address)

    await mineUntilTime(await fixture.seasonOne.endTime())
    await fixture.userStake(fixture.users.alice)

    expect(await fixture.series.liveSeason()).to.equal(1)
  })

  it('should return zero for current staking season if no seasons', async function () {
    // Deploy a Series with no seasons
    await deployWithConfirmation('TestSeriesNoSeason1', [], 'Series')
    const seriesImpl = await ethers.getContract('TestSeriesNoSeason1')

    await deployWithConfirmation(
      'TestSeriesNoSeason1Proxy',
      [seriesImpl.address, fixture.mockOGN.address, fixture.feeVault.address],
      'SeriesProxy'
    )
    const seriesProxy = await ethers.getContract('TestSeriesNoSeason1Proxy')
    const series = await ethers.getContractAt('Series', seriesProxy.address)

    expect(await series.expectedStakingSeason()).to.equal(ZERO_ADDRESS)
  })

  it('should return zero for current staking season if no seasons have started', async function () {
    // Deploy a Series with no seasons
    await deployWithConfirmation('TestSeriesNoSeasonStarted1', [], 'Series')
    const seriesImpl = await ethers.getContract('TestSeriesNoSeasonStarted1')

    await deployWithConfirmation(
      'TestSeriesNoSeasonStarted1Proxy',
      [seriesImpl.address, fixture.mockOGN.address, fixture.feeVault.address],
      'SeriesProxy'
    )
    const seriesProxy = await ethers.getContract(
      'TestSeriesNoSeasonStarted1Proxy'
    )
    const series = await ethers.getContractAt('Series', seriesProxy.address)

    // Deploy a SeasonOne in the future
    const startTime = (await blockStamp()) + 60 * 60
    const lockStartTime = startTime + 200
    const endTime = lockStartTime + 300
    const claimEndTime = endTime + 400
    await deployWithConfirmation(
      'SeasonOneNotStarted',
      [series.address, startTime, lockStartTime, endTime, claimEndTime],
      'Season'
    )
    const seasonOne = await ethers.getContract('SeasonOneNotStarted')
    await series.pushSeason(seasonOne.address)

    // Deploy a SeasonTwo, also in the future
    const startTime2 = await seasonOne.endTime()
    const lockStartTime2 = startTime2 + 200
    const endTime2 = lockStartTime2 + 300
    const claimEndTime2 = endTime2 + 400
    await deployWithConfirmation(
      'SeasonTwoNotStarted',
      [series.address, startTime2, lockStartTime2, endTime2, claimEndTime2],
      'Season'
    )
    const seasonTwo = await ethers.getContract('SeasonTwoNotStarted')
    await series.pushSeason(seasonTwo.address)

    expect(await series.liveSeason()).to.equal(ZERO_ADDRESS)
  })

  it('should return the current staking season (no second season)', async function () {
    await mineUntilTime(await fixture.seasonOne.lockStartTime())

    expect(await fixture.series.expectedStakingSeason()).to.equal(
      fixture.seasonOne.address
    )
  })

  it('should return the current staking season (advance)', async function () {
    await fixture.series.pushSeason(fixture.seasonTwo.address)

    await mineUntilTime(await fixture.seasonOne.lockStartTime())
    await mineBlocks(1)

    expect(await fixture.series.expectedStakingSeason()).to.equal(
      fixture.seasonTwo.address
    )
  })

  it('should return zero for current claiming season if no seasons', async function () {
    // Deploy a Series with no seasons
    await deployWithConfirmation('TestSeriesNoSeason2', [], 'Series')
    const seriesImpl = await ethers.getContract('TestSeriesNoSeason2')

    await deployWithConfirmation(
      'TestSeriesNoSeason2Proxy',
      [seriesImpl.address, fixture.mockOGN.address, fixture.feeVault.address],
      'SeriesProxy'
    )
    const seriesProxy = await ethers.getContract('TestSeriesNoSeason2Proxy')
    const series = await ethers.getContractAt('Series', seriesProxy.address)

    expect(await series.expectedClaimingSeason()).to.equal(ZERO_ADDRESS)
  })

  it('should return the expected claiming season (no advance)', async function () {
    expect(await fixture.series.expectedClaimingSeason()).to.equal(
      fixture.seasonOne.address
    )
  })

  it('should return the expected claiming season (no second season)', async function () {
    await mineUntilTime(await fixture.seasonOne.claimEndTime())

    expect(await fixture.series.expectedClaimingSeason()).to.equal(
      fixture.seasonOne.address
    )
  })

  it('should return the expected claiming season (advance)', async function () {
    await fixture.series.pushSeason(fixture.seasonTwo.address)

    // Need to move into a certain state to try and trigger an error that only
    // occurs where claiming and staking indexes do not match
    await mineUntilTime(await fixture.seasonOne.lockStartTime())
    await fixture.userStake(fixture.users.alice)

    // Deploy a SeasonThree to make sure expected doesn't skip ahead
    const startTime = await fixture.seasonTwo.endTime()
    const lockStartTime = startTime + 200
    const endTime = (await fixture.seasonTwo.claimEndTime()) + 300
    const claimEndTime = endTime + 400
    await deployWithConfirmation(
      'SeasonThree',
      [fixture.series.address, startTime, lockStartTime, endTime, claimEndTime],
      'Season'
    )
    const seasonThree = await ethers.getContract('SeasonThree')
    await fixture.series.pushSeason(seasonThree.address)

    await mineUntilTime(await fixture.seasonOne.claimEndTime())
    await mineBlocks(1)

    const expected = await fixture.series.expectedClaimingSeason()
    expect(expected).to.equal(fixture.seasonTwo.address)

    const index = await fixture.series.currentClaimingIndex()
    const indexed = await fixture.series.seasons(index + 1)
    expect(expected).to.equal(indexed)
  })

  it('can not manually bootstrap a season that does not exist', async function () {
    await deployWithConfirmation('ZeroSeasonSeries', [], 'Series')
    const seriesImpl = await ethers.getContract('ZeroSeasonSeries')

    await expect(seriesImpl.bootstrapSeason(0, 123456789)).to.revertedWith(
      'Series: Season does not exist'
    )
  })

  it('can not manually bootstrap a season that has already been bootstrapped', async function () {
    await mineUntilTime(await fixture.seasonOne.lockStartTime())
    await expect(fixture.series.bootstrapSeason(0, 123456789)).to.revertedWith(
      'Season: Already bootstrapped'
    )
  })

  it('can not bootstrap a season that has not reached lock period', async function () {
    await expect(fixture.series.bootstrapSeason(0, 123456789)).to.revertedWith(
      'Series: Not locked'
    )
  })
})
