const { expect } = require('chai')

const { deployWithConfirmation } = require('../../utils/deploy')

const { stakingFixture } = require('../_fixture')
const { MINTER_ROLE } = require('./_const')
const {
  ONE_OGN,
  ONE_THOUSAND_OGN,
  ZERO_ADDRESS,
  allowToken,
  blockStamp,
  expectSuccess,
  fundToken,
  loadFixture,
  mineUntilTime,
  snapshot,
  rollback
} = require('../helpers')

describe('stOGN', () => {
  let fixture,
    minterAddress,
    snapshotId,
    users = {
      alice: null,
      bob: null,
      charlie: null,
      diana: null,
      elaine: null
    }

  before(async function () {
    snapshotId = await snapshot()
    await deployments.fixture()

    fixture = await loadFixture(stakingFixture)
    users = fixture.users

    const { masterAddr } = await getNamedAccounts()
    fixture.minter = ethers.provider.getSigner(masterAddr)
    minterAddress = await fixture.minter.getAddress()

    // Give all users 1k OGN
    await fundToken(
      fixture.mockOGN,
      fixture.minter,
      minterAddress,
      ONE_THOUSAND_OGN
    )

    const ogn = await ethers.getContract('MockOGN')
    const stOGNImp = await ethers.getContract('StOGN')

    // We're redeploying because the default deploy grants minting admin
    // rights to Series, which prevents us from minting here
    const result = await deployWithConfirmation('StOGNProxy', [
      stOGNImp.address,
      ogn.address,
      ZERO_ADDRESS // do not set minter admin
    ])
    const proxyAddr = result.receipt.contractAddress

    fixture.stOGN = await ethers.getContractAt('StOGN', proxyAddr)
  })

  after(async function () {
    await rollback(snapshotId)
  })

  it('gets initialized properly', async function () {
    const deployerAddress = await fixture.deployer.getAddress()

    expect(await fixture.stOGN.ogn()).to.equal(fixture.mockOGN.address)
    expect(await fixture.stOGN.paused()).to.be.false
    expect(await fixture.stOGN.hasRole(MINTER_ROLE, deployerAddress)).to.be.true

    await expect(
      fixture.feeVault.connect(fixture.nobody).initialize(ZERO_ADDRESS)
    ).to.be.revertedWith('Initializable: contract is already initialized')
  })

  it('grants minting permissions', async function () {
    await expectSuccess(
      fixture.stOGN
        .connect(fixture.deployer)
        .grantRole(MINTER_ROLE, minterAddress)
    )
    expect(
      await fixture.stOGN
        .connect(fixture.deployer)
        .hasRole(MINTER_ROLE, minterAddress)
    ).to.be.true
  })

  it('allows minter to mint', async function () {
    const now = await blockStamp()
    await mineUntilTime(now + 1000)

    expect(await fixture.stOGN.balanceOf(users.alice.address)).to.equal(0)
    expect(await fixture.stOGN.totalSupplyAt(now)).to.equal(0)

    await expectSuccess(
      allowToken(
        fixture.mockOGN,
        fixture.minter,
        fixture.stOGN.address,
        ONE_OGN
      )
    )
    const mintReceipt = await expectSuccess(
      fixture.stOGN.connect(fixture.minter).mint(users.alice.address, ONE_OGN)
    )

    expect(await fixture.mockOGN.balanceOf(minterAddress)).to.equal(
      ONE_THOUSAND_OGN.sub(ONE_OGN)
    )
    expect(await fixture.stOGN.balanceOf(users.alice.address)).to.equal(ONE_OGN)

    const mintStamp = await blockStamp(mintReceipt.blockNumber)

    expect(await fixture.stOGN.totalSupplyAt(mintStamp - 1)).to.equal(0)

    users.alice.mintedAt = mintStamp

    // get us a buffer for history
    await mineUntilTime(users.alice.mintedAt + 5000)
  })

  it('allows minter to burn', async function () {
    await expectSuccess(
      fixture.stOGN.connect(fixture.minter).burn(users.alice.address, ONE_OGN)
    )
    expect(await fixture.stOGN.balanceOf(users.alice.address)).to.equal(0)
    expect(await fixture.mockOGN.balanceOf(minterAddress)).to.equal(
      ONE_THOUSAND_OGN
    )
    users.alice.burnedAt = await blockStamp()

    // get us a buffer for history
    await mineUntilTime(users.alice.burnedAt + 5000)
  })

  it('allows minter to burnTo', async function () {
    const amountOGN = ONE_OGN.mul(3)
    await expectSuccess(
      allowToken(
        fixture.mockOGN,
        fixture.minter,
        fixture.stOGN.address,
        amountOGN
      )
    )
    await expectSuccess(
      fixture.stOGN.connect(fixture.minter).mint(users.bob.address, amountOGN)
    )

    await expectSuccess(
      fixture.stOGN
        .connect(fixture.minter)
        .burnTo(users.bob.address, users.bob.address, amountOGN)
    )
    expect(await fixture.stOGN.balanceOf(users.bob.address)).to.equal(0)
    expect(await fixture.mockOGN.balanceOf(users.bob.address)).to.equal(
      amountOGN
    )
    users.bob.burnedAt = await blockStamp()

    // get us a buffer for history
    await mineUntilTime(users.bob.burnedAt + 5000)
  })

  it('pause prevents mint/burn/transfer', async function () {
    await expectSuccess(fixture.stOGN.connect(fixture.deployer).pause())

    await expect(
      fixture.stOGN.mint(users.charlie.address, ONE_OGN)
    ).to.be.revertedWith('Pausable: paused')

    await expect(
      fixture.stOGN.burn(users.bob.address, ONE_OGN)
    ).to.be.revertedWith('Pausable: paused')

    await expect(
      fixture.stOGN.burnTo(users.bob.address, users.bob.address, ONE_OGN)
    ).to.be.revertedWith('Pausable: paused')

    await expect(
      fixture.stOGN.transferFrom(
        users.bob.address,
        users.charlie.address,
        ONE_OGN
      )
    ).to.be.revertedWith('Pausable: paused')

    await expect(
      fixture.stOGN
        .connect(fixture.minter)
        .transfer(users.charlie.address, ONE_OGN)
    ).to.be.revertedWith('Pausable: paused')

    await expectSuccess(fixture.stOGN.connect(fixture.deployer).unpause())
  })

  it('returns historical balance at mint checkpoint', async function () {
    expect(
      await fixture.stOGN.balanceAt(users.alice.address, users.alice.mintedAt)
    ).to.equal(ONE_OGN)
    expect(
      await fixture.stOGN.balanceAt(
        users.alice.address,
        users.alice.mintedAt + 1000
      )
    ).to.equal(ONE_OGN)
    expect(
      await fixture.stOGN.totalSupplyAt(users.alice.mintedAt + 1000)
    ).to.equal(ONE_OGN)
  })

  it('returns historical balance at burn checkpoint', async function () {
    expect(
      await fixture.stOGN.balanceAt(users.alice.address, users.alice.burnedAt)
    ).to.equal(0)
    expect(
      await fixture.stOGN.balanceAt(
        users.alice.address,
        users.alice.burnedAt + 1000
      )
    ).to.equal(0)
  })

  // transfer disabled
  it.skip('allows transfer', async function () {
    expect(await fixture.stOGN.balanceOf(users.bob.address)).to.equal(0)
    await expectSuccess(
      allowToken(
        fixture.mockOGN,
        fixture.minter,
        fixture.stOGN.address,
        ONE_OGN
      )
    )
    await expectSuccess(
      fixture.stOGN.connect(fixture.minter).mint(users.bob.address, ONE_OGN)
    )
    users.bob.mintedAt = await blockStamp()

    // Transfer Bob's fixture.stOGN to Charlie
    const receipt = await expectSuccess(
      fixture.stOGN
        .connect(users.bob.signer)
        .transfer(users.charlie.address, ONE_OGN)
    )
    const transferStamp = await blockStamp(receipt.blockNumber)

    expect(await fixture.stOGN.balanceOf(users.bob.address)).to.equal(0)
    expect(await fixture.stOGN.balanceOf(users.charlie.address)).to.equal(
      ONE_OGN
    )

    // get us a buffer for historical lookup
    await mineUntilTime(transferStamp + 5000)

    // Verify checkpoint balances recorded
    expect(
      await fixture.stOGN.balanceAt(users.bob.address, transferStamp - 1)
    ).to.equal(ONE_OGN)
    expect(
      await fixture.stOGN.balanceAt(users.bob.address, transferStamp)
    ).to.equal(0)
    expect(
      await fixture.stOGN.balanceAt(users.charlie.address, transferStamp - 1)
    ).to.equal(0)
    expect(
      await fixture.stOGN.balanceAt(users.charlie.address, transferStamp)
    ).to.equal(ONE_OGN)
  })
})
