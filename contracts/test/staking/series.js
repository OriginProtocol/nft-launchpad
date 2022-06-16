const { expect } = require('chai')

const { deployWithConfirmation } = require('../../utils/deploy')
const { stakingFixture } = require('../_fixture')
const {
  ONE_ETH,
  ONE_THOUSAND_OGN,
  ZERO_ADDRESS,
  expectSuccess,
  loadFixture,
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

  it('can not set Vault implementation to zero address', async function () {
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
    await expect(series.claim(randomAddress())).to.be.revertedWith(
      'Series: No active season'
    )
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
})
