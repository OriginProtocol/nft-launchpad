const { expect } = require('chai')

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

describe('FeeVault', () => {
  let collectedRewards = ethers.BigNumber.from(0),
    fixture,
    snapshotID,
    users = {
      alice: null,
      bob: null,
      charlie: null,
      diana: null,
      elaine: null
    }

  before(async function () {
    snapshotID = await snapshot()
    await deployments.fixture()

    fixture = await loadFixture(stakingFixture)
    users = fixture.users
  })

  after(async function () {
    await rollback(snapshotID)
  })

  it('gets properly deployed and initialized', async function () {
    const deployerAddress = await fixture.deployer.getAddress()
    expect(await fixture.feeVaultProxy.governor()).to.equal(deployerAddress)
    expect(await fixture.feeVault.governor()).to.equal(deployerAddress)
    expect(await fixture.feeVault.currentSeason()).to.equal(
      fixture.seasonOne.address
    )
    await expect(fixture.feeVault.initialize(ZERO_ADDRESS)).to.be.revertedWith(
      'Initializable: contract is already initialized'
    )
  })

  it('knows the current season', async function () {
    expect(await fixture.feeVault.currentSeason()).to.equal(
      fixture.seasonOne.address
    )
  })

  it('allows rewards to be collected', async function () {
    const royalty = ONE_ETH.mul(5)
    expect(await ethers.provider.getBalance(fixture.feeVault.address)).to.equal(
      0
    )

    // Drop some rewards on the vault
    await expectSuccess(
      fixture.master.sendTransaction({
        to: fixture.feeVault.address,
        value: royalty
      })
    )

    expect(await ethers.provider.getBalance(fixture.feeVault.address)).to.equal(
      royalty
    )

    // Anyone can call collectRewards()
    const receipt = await expectSuccess(
      fixture.feeVault.connect(fixture.nobody).collectRewards()
    )
    const collectedEv = receipt.events.filter(
      (ev) => ev.event === 'RewardsCollected'
    )
    collectedRewards = collectedRewards.add(royalty)
    expect(collectedEv.length).to.equal(1)
    expect(collectedEv[0].args.amount).to.equal(royalty)

    expect(await ethers.provider.getBalance(fixture.feeVault.address)).to.equal(
      0
    )
    expect(
      await ethers.provider.getBalance(fixture.seasonOne.address)
    ).to.equal(collectedRewards)
  })

  it('can recover ERC20 tokens', async function () {
    const deployerAddress = await fixture.deployer.getAddress()
    await fixture.fundOGN(fixture.feeVault.address, ONE_THOUSAND_OGN)
    expect(await fixture.mockOGN.balanceOf(fixture.feeVault.address)).to.equal(
      ONE_THOUSAND_OGN
    )
    await fixture.feeVault
      .connect(fixture.deployer)
      .recoverERC20(fixture.mockOGN.address, ONE_THOUSAND_OGN, deployerAddress)
    expect(await fixture.mockOGN.balanceOf(fixture.feeVault.address)).to.equal(
      0
    )
    expect(await fixture.mockOGN.balanceOf(deployerAddress)).to.equal(
      ONE_THOUSAND_OGN
    )
  })

  it('can be paused', async function () {
    expect(await fixture.feeVault.paused()).to.be.false

    await expect(
      fixture.feeVault.connect(fixture.nobody).pause()
    ).to.be.revertedWith('Caller is not the Governor')
    await expectSuccess(fixture.feeVault.connect(fixture.deployer).pause())

    expect(await fixture.feeVault.paused()).to.be.true

    await expect(
      fixture.feeVault.connect(fixture.nobody).collectRewards()
    ).to.be.revertedWith('Pausable: paused')
  })

  it('can be unpaused', async function () {
    await expect(
      fixture.feeVault.connect(fixture.nobody).unpause()
    ).to.be.revertedWith('Caller is not the Governor')
    await expectSuccess(fixture.feeVault.connect(fixture.deployer).unpause())

    expect(await fixture.feeVault.paused()).to.be.false
  })

  it('can set series address', async function () {
    const newSeries = randomAddress()
    expect(await fixture.feeVault.series()).to.equal(fixture.series.address)

    await expect(
      fixture.feeVault.connect(fixture.nobody).setSeries(newSeries)
    ).to.be.revertedWith('Caller is not the Governor')
    await fixture.feeVault.connect(fixture.deployer).setSeries(newSeries)

    expect(await fixture.feeVault.series()).to.equal(newSeries)
  })
})
