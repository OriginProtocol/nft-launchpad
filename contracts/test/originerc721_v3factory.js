const { expect } = require('chai')
const { defaultFixture } = require('./_fixture')
const { loadFixture } = require('./helpers')

describe('OriginERC721_v3Factory', () => {
  it('Can create token', async () => {
    const { masterAddr } = await getNamedAccounts()
    const { factory, master, nftv3 } = await loadFixture(defaultFixture)

    const res = await factory
      .connect(master)
      .createToken("Franck's Toys", 'FRANC', 'https://nft.franck.com/nft/')
    const tx = await res.wait()
    const createTokenEvent = tx.events.find((e) => e.event === 'CreateToken')

    const token = nftv3.attach(createTokenEvent.args.addr)
    const symbol = await token.symbol()
    expect(symbol).to.be.equal('FRANC')

    const ownerRole = await token.DEFAULT_ADMIN_ROLE()
    const isOwner = await token.hasRole(ownerRole, masterAddr)
    expect(isOwner).to.be.equal(true)

    const minterRole = await token.MINTER_ROLE()
    let isMinter = await token.hasRole(minterRole, masterAddr)
    expect(isMinter).to.be.equal(true)

    const newMinter = ethers.provider.getSigner(4)
    const newMinterAddress = await newMinter.getAddress()
    isMinter = await token.hasRole(minterRole, newMinterAddress)
    expect(isMinter).to.be.equal(false)

    await expect(
      token.connect(newMinter).safeMint(newMinterAddress, 24)
    ).to.be.revertedWith(
      `AccessControl: account ${newMinterAddress.toLowerCase()} is missing role ${minterRole}`
    )

    await token.connect(master).grantRole(minterRole, newMinterAddress)
    isMinter = await token.hasRole(minterRole, newMinterAddress)
    expect(isMinter).to.be.equal(true)

    await token.connect(newMinter).safeMint(newMinterAddress, 24)
    expect(await token.ownerOf(24)).to.be.equal(newMinterAddress)

    // console.log(`factory ${factory.address}`, ownerRole, isOwner)
    // for (const log of tx.logs) {
    //   try {
    //     const parsed = nftv3.interface.parseLog(log)
    //     console.log(parsed.name, parsed.args)
    //   } catch (e) {
    //     console.log(e)
    //   }
    // }
  })

  it('Can create token with a minter', async () => {
    const { masterAddr } = await getNamedAccounts()
    const { factory, master, nftv3 } = await loadFixture(defaultFixture)

    const minter = ethers.provider.getSigner(4)
    const minterAddress = await minter.getAddress()

    const res = await factory
      .connect(master)
      .createTokenWithMinter(
        minterAddress,
        "Mike's ART",
        'MART',
        'https://nft.mikeshultz.com/nft/'
      )

    const tx = await res.wait()
    const createTokenEvent = tx.events.find((e) => e.event === 'CreateToken')

    const token = nftv3.attach(createTokenEvent.args.addr)
    const symbol = await token.symbol()
    expect(symbol).to.be.equal('MART')

    const ownerRole = await token.DEFAULT_ADMIN_ROLE()
    const isOwner = await token.hasRole(ownerRole, masterAddr)
    expect(isOwner).to.be.equal(true)

    // Both deployer and minter should have the minter role
    const minterRole = await token.MINTER_ROLE()
    expect(await token.hasRole(minterRole, masterAddr)).to.be.true
    expect(await token.hasRole(minterRole, minterAddress)).to.be.true

    await token.connect(minter).safeMint(minterAddress, 48)
    expect(await token.ownerOf(48)).to.be.equal(minterAddress)
  })
})
