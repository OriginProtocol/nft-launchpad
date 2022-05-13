const { expect } = require('chai')
const { defaultFixture } = require('./_fixture')
const { loadFixture } = require('./helpers')

describe('Blau token works', () => {
  it('Can Mint', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { blau, master } = fixture
    const randomUserOne = ethers.provider.getSigner(4)
    const randomUserTwo = ethers.provider.getSigner(4)

    // Mint works
    const userOneAddress = await randomUserOne.getAddress()
    blau.connect(master).safeMint(userOneAddress, 23)
    expect(await blau.ownerOf(23)).to.be.equal(userOneAddress)

    // Normal user can't
    //
    await expect(
      blau.connect(randomUserTwo).safeMint(userOneAddress, 24)
    ).to.be.revertedWith('Ownable: caller is not the owner')
  })

  it('Can set URI', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { blau, master } = fixture
    const randomUser = ethers.provider.getSigner(4)

    // mint token 42
    await blau.connect(master).safeMint(await randomUser.getAddress(), 42)

    expect(await blau.tokenURI(42)).to.be.equal('https://nft.3lau.com/nft/42')

    // master can change base URI
    await blau.connect(master).setBaseURI('https://3.com/')

    expect(await blau.tokenURI(42)).to.be.equal('https://3.com/42')

    // Normal user cannot change url
    //
    await expect(
      blau.connect(randomUser).setBaseURI('https://3.com/')
    ).to.be.revertedWith('Ownable: caller is not the owner')
  })

  it('Can mass mint', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { blau, master } = fixture
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
    const txt = await blau
      .connect(master)
      .massMint(userOneAddress, ids, adminAddress)
    const receipt = await ethers.provider.getTransactionReceipt(txt.hash)
    // there should be 2 event for each token created
    expect(receipt.logs.length).to.be.equal(20)
    expect(await blau.ownerOf(107)).to.be.equal(userOneAddress)

    // Admin can transfer after mint
    await blau.connect(admin).transferFrom(userOneAddress, userTwoAddress, 107)
    expect(await blau.ownerOf(107)).to.be.equal(userTwoAddress)

    await expect(
      blau.connect(randomUserTwo).massMint(userOneAddress, ids, adminAddress)
    ).to.be.revertedWith('Ownable: caller is not the owner')

    await expect(
      blau
        .connect(randomUserTwo)
        .transferFrom(userOneAddress, userTwoAddress, 108)
    ).to.be.revertedWith('ERC721: transfer caller is not owner nor approved')
  })
})
