const { expect } = require('chai')
const { defaultFixture } = require('./_fixture')
const { loadFixture } = require('./helpers')

describe('OriginERC721_v3 token works', () => {
  it('Can Mint', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { nftv3, master } = fixture
    const randomUserOne = ethers.provider.getSigner(4)
    const randomUserTwo = ethers.provider.getSigner(4)

    // Mint works
    const userOneAddress = await randomUserOne.getAddress()
    await nftv3.connect(master).safeMint(userOneAddress, 23)
    expect(await nftv3.ownerOf(23)).to.be.equal(userOneAddress)

    // Normal user can't
    const userTwoAddress = await randomUserTwo.getAddress()
    await expect(
      nftv3.connect(randomUserTwo).safeMint(userOneAddress, 24)
    ).to.be.revertedWith(
      `AccessControl: account ${userTwoAddress.toLowerCase()} is missing role 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`
    )
  })

  it('Can set URI', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { nftv3, master } = fixture
    const randomUser = ethers.provider.getSigner(4)

    // mint token 42
    await nftv3.connect(master).safeMint(await randomUser.getAddress(), 42)

    expect(await nftv3.tokenURI(42)).to.be.equal(
      'https://nft.franck.com/nft/42'
    )

    // master can change base URI
    await nftv3.connect(master).setBaseURI('https://version3.com/')

    expect(await nftv3.tokenURI(42)).to.be.equal('https://version3.com/42')

    expect(await nftv3.contractURI()).to.be.equal(
      'https://version3.com/contract.json'
    )

    // Normal user cannot change url
    const randomUserAddress = await randomUser.getAddress()
    await expect(
      nftv3.connect(randomUser).setBaseURI('https://boogers.com/')
    ).to.be.revertedWith(
      `AccessControl: account ${randomUserAddress.toLowerCase()} is missing role 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`
    )
  })

  it('Can mass mint', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { nftv3, master } = fixture
    const randomUser = ethers.provider.getSigner(4)

    const randomUserOne = ethers.provider.getSigner(4)
    const randomUserTwo = ethers.provider.getSigner(5)
    const admin = ethers.provider.getSigner(6)

    const ids = []
    for (let i = 100; i < 110; i++) {
      ids.push(i)
    }

    const userOneAddress = await randomUserOne.getAddress()
    const userTwoAddress = await randomUserTwo.getAddress()
    const adminAddress = await admin.getAddress()

    // Mint stack of NFT's, and allow admin to transfer them later
    const txt = await nftv3
      .connect(master)
      .massMint(userOneAddress, ids, adminAddress)
    const receipt = await ethers.provider.getTransactionReceipt(txt.hash)
    // there should be 2 event for each token created
    expect(receipt.logs.length).to.be.equal(20)
    expect(await nftv3.ownerOf(107)).to.be.equal(userOneAddress)

    // Admin can transfer after mint
    await nftv3.connect(admin).transferFrom(userOneAddress, userTwoAddress, 107)
    expect(await nftv3.ownerOf(107)).to.be.equal(userTwoAddress)

    const randomUserTwoAddress = await randomUserTwo.getAddress()
    await expect(
      nftv3.connect(randomUserTwo).massMint(userOneAddress, ids, adminAddress)
    ).to.be.revertedWith(
      `AccessControl: account ${randomUserTwoAddress.toLowerCase()} is missing role 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`
    )

    await expect(
      nftv3
        .connect(randomUserTwo)
        .transferFrom(userOneAddress, userTwoAddress, 108)
    ).to.be.revertedWith('ERC721: transfer caller is not owner nor approved')
  })

  it('Can change Owner', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { nftv3, master } = fixture
    const prevOwnerAddress = await master.getAddress()
    const newOwner = ethers.provider.getSigner(4)
    const newOwnerAddress = await newOwner.getAddress()

    const minterRole = await nftv3.MINTER_ROLE()
    expect(await nftv3.hasRole(minterRole, prevOwnerAddress)).to.be.equal(true)
    expect(await nftv3.hasRole(minterRole, newOwnerAddress)).to.be.equal(false)

    // Transfer ownership
    await nftv3.connect(master).grantRole(minterRole, newOwnerAddress)
    await nftv3.connect(master).revokeRole(minterRole, prevOwnerAddress)

    expect(await nftv3.hasRole(minterRole, prevOwnerAddress)).to.be.equal(false)
    expect(await nftv3.hasRole(minterRole, newOwnerAddress)).to.be.equal(true)

    // master can't change the base URI anymore
    await expect(
      nftv3.connect(master).setBaseURI('https://boogers.com/')
    ).to.be.revertedWith(
      `AccessControl: account ${prevOwnerAddress.toLowerCase()} is missing role ${minterRole}`
    )
    await nftv3.connect(newOwner).setBaseURI('https://version3.com/')
  })
})
