const { expect } = require('chai')
const { defaultFixture } = require('./_fixture')
const { loadFixture } = require('./helpers')

describe('OriginERC721_v2 token works', () => {
  it('Can Mint', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { nftv2, master } = fixture
    const randomUserOne = ethers.provider.getSigner(4)
    const randomUserTwo = ethers.provider.getSigner(4)

    // Mint works
    const userOneAddress = await randomUserOne.getAddress()
    await nftv2.connect(master).safeMint(userOneAddress, 23)
    expect(await nftv2.ownerOf(23)).to.be.equal(userOneAddress)

    // Normal user can't
    //
    await expect(
      nftv2.connect(randomUserTwo).safeMint(userOneAddress, 24)
    ).to.be.revertedWith('Ownable: caller is not the owner')
  })

  it('Can set URI', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { nftv2, master } = fixture
    const randomUser = ethers.provider.getSigner(4)

    // mint token 42
    await nftv2.connect(master).safeMint(await randomUser.getAddress(), 42)

    expect(await nftv2.tokenURI(42)).to.be.equal(
      'https://nft.franck.com/nft/42'
    )

    // master can change base URI
    await nftv2.connect(master).setBaseURI('https://version2.com/')

    expect(await nftv2.tokenURI(42)).to.be.equal('https://version2.com/42')

    expect(await nftv2.contractURI()).to.be.equal(
      'https://version2.com/contract.json'
    )

    // Normal user cannot change url
    //
    await expect(
      nftv2.connect(randomUser).setBaseURI('https://boogers.com/')
    ).to.be.revertedWith('Ownable: caller is not the owner')
  })

  it('Can mass mint', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { nftv2, master } = fixture
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
    const txt = await nftv2
      .connect(master)
      .massMint(userOneAddress, ids, adminAddress)
    const receipt = await ethers.provider.getTransactionReceipt(txt.hash)
    // there should be 2 event for each token created
    expect(receipt.logs.length).to.be.equal(20)
    expect(await nftv2.ownerOf(107)).to.be.equal(userOneAddress)

    // Admin can transfer after mint
    await nftv2.connect(admin).transferFrom(userOneAddress, userTwoAddress, 107)
    expect(await nftv2.ownerOf(107)).to.be.equal(userTwoAddress)

    await expect(
      nftv2.connect(randomUserTwo).massMint(userOneAddress, ids, adminAddress)
    ).to.be.revertedWith('Ownable: caller is not the owner')

    await expect(
      nftv2
        .connect(randomUserTwo)
        .transferFrom(userOneAddress, userTwoAddress, 108)
    ).to.be.revertedWith('ERC721: transfer caller is not owner nor approved')
  })

  it('Can change Owner', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { nftv2, master } = fixture
    const prevOwnerAddress = await master.getAddress()
    const newOwner = ethers.provider.getSigner(4)
    const newOwnerAddress = await newOwner.getAddress()

    expect(await nftv2.owner()).to.be.equal(prevOwnerAddress)

    // Transfer ownership
    await nftv2.connect(master).transferOwnership(newOwnerAddress)
    expect(await nftv2.owner()).to.be.equal(newOwnerAddress)

    // master can't change the base URI anymore
    await expect(
      nftv2.connect(master).setBaseURI('https://boogers.com/')
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await nftv2.connect(newOwner).setBaseURI('https://version2.com/')
  })
})
