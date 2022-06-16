const { expect } = require('chai')

const { deployWithConfirmation } = require('../../utils/deploy')
const { stakingFixture } = require('../_fixture')
const {
  ONE_ETH,
  ONE_OGN,
  ONE_THOUSAND_OGN,
  ZERO_ADDRESS,
  expectSuccess,
  loadFixture,
  randomAddress,
  rollback,
  snapshot
} = require('../helpers')

describe('FeeVault', () => {
  let collectedETHRewards = ethers.BigNumber.from(0),
    collectedOGNRewards = ethers.BigNumber.from(0),
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
    expect(await fixture.feeVault.controller()).to.equal(fixture.series.address)
    await expect(fixture.feeVault.initialize(ZERO_ADDRESS)).to.be.revertedWith(
      'Initializable: contract is already initialized'
    )
  })

  it('knows the current controller', async function () {
    expect(await fixture.feeVault.controller()).to.equal(fixture.series.address)
  })

  it('governor can chance controller', async function () {
    await expectSuccess(
      fixture.feeVault
        .connect(fixture.deployer)
        .setController(users.charlie.address)
    )
    expect(await fixture.feeVault.controller()).to.equal(users.charlie.address)
  })

  it('allows rewards to be sent', async function () {
    const royalty = ONE_ETH.mul(5)
    const bobsOriginalBalance = await users.bob.signer.getBalance()
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
    await fixture.fundOGN(fixture.feeVault.address, ONE_THOUSAND_OGN)

    expect(await ethers.provider.getBalance(fixture.feeVault.address)).to.equal(
      royalty
    )
    expect(await fixture.mockOGN.balanceOf(fixture.feeVault.address)).to.equal(
      ONE_THOUSAND_OGN
    )

    // Allows controller to send rewards
    const receiptETH = await expectSuccess(
      fixture.feeVault
        .connect(users.charlie.signer)
        .sendETHRewards(users.bob.address, royalty)
    )
    const collectedETHEv = receiptETH.events.filter(
      (ev) => ev.event === 'RewardsSent'
    )
    collectedETHRewards = collectedETHRewards.add(royalty)
    expect(collectedETHEv.length).to.equal(1)
    expect(collectedETHEv[0].args.amount).to.equal(royalty)

    expect(await ethers.provider.getBalance(fixture.feeVault.address)).to.equal(
      0
    )
    expect(await ethers.provider.getBalance(users.bob.address)).to.equal(
      bobsOriginalBalance.add(collectedETHRewards)
    )

    const receiptOGN = await expectSuccess(
      fixture.feeVault
        .connect(users.charlie.signer)
        .sendTokenRewards(
          fixture.mockOGN.address,
          users.bob.address,
          ONE_THOUSAND_OGN.div(2)
        )
    )
    const collectedOGNEv = receiptOGN.events.filter(
      (ev) => ev.event === 'RewardsSent'
    )
    collectedOGNRewards = collectedOGNRewards.add(royalty)
    expect(collectedOGNEv.length).to.equal(1)
    expect(collectedOGNEv[0].args.amount).to.equal(ONE_THOUSAND_OGN.div(2))
    expect(await fixture.mockOGN.balanceOf(fixture.feeVault.address)).to.equal(
      ONE_THOUSAND_OGN.div(2)
    )
  })

  it('can recover ERC20 tokens', async function () {
    const deployerAddress = await fixture.deployer.getAddress()
    //await fixture.fundOGN(fixture.feeVault.address, ONE_THOUSAND_OGN)
    // Leftover rewards from previous test
    expect(await fixture.mockOGN.balanceOf(fixture.feeVault.address)).to.equal(
      ONE_THOUSAND_OGN.div(2)
    )
    await fixture.feeVault
      .connect(fixture.deployer)
      .recoverERC20(
        fixture.mockOGN.address,
        ONE_THOUSAND_OGN.div(2),
        deployerAddress
      )
    expect(await fixture.mockOGN.balanceOf(fixture.feeVault.address)).to.equal(
      0
    )
    expect(await fixture.mockOGN.balanceOf(deployerAddress)).to.equal(
      ONE_THOUSAND_OGN.div(2)
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
      fixture.feeVault
        .connect(fixture.nobody)
        .sendETHRewards(users.diana.address, ONE_ETH)
    ).to.be.revertedWith('Pausable: paused')

    await expect(
      fixture.feeVault
        .connect(fixture.nobody)
        .sendTokenRewards(fixture.mockOGN.address, users.diana.address, ONE_ETH)
    ).to.be.revertedWith('Pausable: paused')
  })

  it('can be unpaused', async function () {
    await expect(
      fixture.feeVault.connect(fixture.nobody).unpause()
    ).to.be.revertedWith('Caller is not the Governor')
    await expectSuccess(fixture.feeVault.connect(fixture.deployer).unpause())

    expect(await fixture.feeVault.paused()).to.be.false
  })

  it('can be deployed with a controller', async function () {
    const controllerAddress = randomAddress()
    await deployWithConfirmation('FeeVault')
    const feeVaultImpl = await hre.ethers.getContract('FeeVault')

    await deployWithConfirmation('FeeVaultProxy', [
      feeVaultImpl.address,
      controllerAddress
    ])
    const feeVaultProxy = await hre.ethers.getContract('FeeVaultProxy')
    const feeVault = await hre.ethers.getContractAt(
      'FeeVault',
      feeVaultProxy.address
    )

    expect(await feeVault.controller()).to.equal(controllerAddress)
  })

  it('does not allow randos to send rewards', async function () {
    await expect(
      fixture.feeVault
        .connect(fixture.nobody)
        .sendETHRewards(randomAddress(), ONE_ETH)
    ).to.be.revertedWith('FeeVault: Sender not controller')
    await expect(
      fixture.feeVault
        .connect(fixture.nobody)
        .sendTokenRewards(
          '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          randomAddress(),
          ONE_ETH
        )
    ).to.be.revertedWith('FeeVault: Sender not controller')
  })

  it('does not allow controller to burn ETH', async function () {
    await expectSuccess(
      fixture.feeVault.setController(await fixture.master.getAddress())
    )
    await expect(
      fixture.feeVault
        .connect(fixture.master)
        .sendETHRewards(ZERO_ADDRESS, ONE_ETH)
    ).to.be.revertedWith('FeeVault: ETH to black hole')
  })

  it('does not allow controller to send 0 ETH', async function () {
    await expectSuccess(
      fixture.feeVault.setController(await fixture.master.getAddress())
    )
    await expect(
      fixture.feeVault
        .connect(fixture.master)
        .sendETHRewards(randomAddress(), 0)
    ).to.be.revertedWith('FeeVault: Attempt to send 0 ETH')
  })

  it('reverts on ETH send failure', async function () {
    await deployWithConfirmation('ReceiveFail', [])
    const testReceive = await hre.ethers.getContract('ReceiveFail')

    await expectSuccess(
      fixture.feeVault.setController(await fixture.master.getAddress())
    )
    await expect(
      fixture.feeVault
        .connect(fixture.master)
        .sendETHRewards(testReceive.address, 1)
    ).to.be.revertedWith('FeeVault: ETH transfer failed')
  })

  it('does not allow controller to burn OGN', async function () {
    await expectSuccess(
      fixture.feeVault.setController(await fixture.master.getAddress())
    )
    await expect(
      fixture.feeVault
        .connect(fixture.master)
        .sendTokenRewards(fixture.mockOGN.address, ZERO_ADDRESS, ONE_OGN)
    ).to.be.revertedWith('FeeVault: Token to black hole')
  })

  it('does not allow controller to send 0 OGN', async function () {
    await expectSuccess(
      fixture.feeVault.setController(await fixture.master.getAddress())
    )
    await expect(
      fixture.feeVault
        .connect(fixture.master)
        .sendTokenRewards(fixture.mockOGN.address, randomAddress(), 0)
    ).to.be.revertedWith('FeeVault: Attempt to send 0')
  })
})
