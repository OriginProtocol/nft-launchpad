const { expect } = require('chai')
const { defaultFixture } = require('./_fixture')
const { loadFixture } = require('./helpers')

describe('PolygonERC721_v2 token works', () => {
  it('Can Mint', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { polygonV2, master, deployer } = fixture
    const randomUserOne = ethers.provider.getSigner(4)
    const randomUserTwo = ethers.provider.getSigner(4)

    // Both deployer and master should be able to mint
    const userOneAddress = await randomUserOne.getAddress()
    await polygonV2.connect(deployer).safeMint(userOneAddress, 23)
    expect(await polygonV2.ownerOf(23)).to.be.equal(userOneAddress)

    await polygonV2.connect(master).safeMint(userOneAddress, 24)
    expect(await polygonV2.ownerOf(24)).to.be.equal(userOneAddress)

    // Normal user can't
    const userTwoAddress = await randomUserTwo.getAddress()
    await expect(
      polygonV2.connect(randomUserTwo).safeMint(userOneAddress, 24)
    ).to.be.revertedWith(`ChildMintableERC721: INSUFFICIENT_PERMISSIONS`)
  })

  it('Can set URI', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { polygonV2, master, deployer } = fixture
    const randomUser = ethers.provider.getSigner(4)

    // mint token 42
    await polygonV2
      .connect(deployer)
      .safeMint(await randomUser.getAddress(), 42)

    expect(await polygonV2.tokenURI(42)).to.be.equal(
      'https://nft.marck.com/nft/42'
    )

    // deployer can change base URI
    await polygonV2.connect(deployer).setBaseURI('https://version3.com/')

    expect(await polygonV2.tokenURI(42)).to.be.equal('https://version3.com/42')

    expect(await polygonV2.contractURI()).to.be.equal(
      'https://version3.com/contract.json'
    )

    // minter(master) cannot change url
    await expect(
      polygonV2.connect(master).setBaseURI('https://boogers.com/')
    ).to.be.revertedWith(`ChildMintableERC721: INSUFFICIENT_PERMISSIONS`)

    // Normal user cannot change url
    const randomUserAddress = await randomUser.getAddress()
    await expect(
      polygonV2.connect(randomUser).setBaseURI('https://boogers.com/')
    ).to.be.revertedWith(`ChildMintableERC721: INSUFFICIENT_PERMISSIONS`)
  })

  it('Can mass mint', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { polygonV2, master, deployer } = fixture

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
    const tx = await polygonV2
      .connect(deployer)
      .massMint(userOneAddress, ids, adminAddress)
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash)
    // there should be 2 event for each token created
    expect(receipt.logs.length).to.be.equal(20)
    expect(await polygonV2.ownerOf(107)).to.be.equal(userOneAddress)

    // Admin can transfer after mint
    await polygonV2
      .connect(admin)
      .transferFrom(userOneAddress, userTwoAddress, 107)
    expect(await polygonV2.ownerOf(107)).to.be.equal(userTwoAddress)

    // minter(master) can massMint too
    const tx2 = await polygonV2
      .connect(master)
      .massMint(userOneAddress, [5, 6, 7], adminAddress)
    const receipt2 = await ethers.provider.getTransactionReceipt(tx2.hash)
    // there should be 2 event for each token created
    expect(receipt2.logs.length).to.be.equal(6)
    expect(await polygonV2.ownerOf(6)).to.be.equal(userOneAddress)

    // random addresses can't mint
    await randomUserTwo.getAddress()
    await expect(
      polygonV2
        .connect(randomUserTwo)
        .massMint(userOneAddress, ids, adminAddress)
    ).to.be.revertedWith(`ChildMintableERC721: INSUFFICIENT_PERMISSIONS`)

    await expect(
      polygonV2
        .connect(randomUserTwo)
        .transferFrom(userOneAddress, userTwoAddress, 108)
    ).to.be.revertedWith('ERC721: transfer caller is not owner nor approved')
  })

  it('Can change Owner', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { polygonV2, deployer } = fixture
    const prevOwnerAddress = await deployer.getAddress()
    const newOwner = ethers.provider.getSigner(4)
    const newOwnerAddress = await newOwner.getAddress()

    const adminRole = await polygonV2.DEFAULT_ADMIN_ROLE()
    expect(await polygonV2.hasRole(adminRole, prevOwnerAddress)).to.be.equal(
      true
    )
    expect(await polygonV2.hasRole(adminRole, newOwnerAddress)).to.be.equal(
      false
    )

    // Transfer ownership
    await polygonV2.connect(deployer).grantRole(adminRole, newOwnerAddress)
    await polygonV2.connect(deployer).revokeRole(adminRole, prevOwnerAddress)

    expect(await polygonV2.hasRole(adminRole, prevOwnerAddress)).to.be.equal(
      false
    )
    expect(await polygonV2.hasRole(adminRole, newOwnerAddress)).to.be.equal(
      true
    )

    // deployer can't change the base URI anymore
    await expect(
      polygonV2.connect(deployer).setBaseURI('https://boogers.com/')
    ).to.be.revertedWith(`ChildMintableERC721: INSUFFICIENT_PERMISSIONS`)

    await polygonV2.connect(newOwner).setBaseURI('https://version3.com/')
  })

  it('Can change Minter', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { polygonV2, master, deployer } = fixture
    const prevMinterAddress = await master.getAddress()
    const newMinter = ethers.provider.getSigner(4)
    const newMinterAddress = await newMinter.getAddress()

    const minterRole = await polygonV2.MINTER_ROLE()
    expect(await polygonV2.hasRole(minterRole, prevMinterAddress)).to.be.equal(
      true
    )
    expect(await polygonV2.hasRole(minterRole, newMinterAddress)).to.be.equal(
      false
    )

    // Transfer ownership
    await polygonV2.connect(deployer).grantRole(minterRole, newMinterAddress)
    await polygonV2.connect(deployer).revokeRole(minterRole, prevMinterAddress)

    expect(await polygonV2.hasRole(minterRole, prevMinterAddress)).to.be.equal(
      false
    )
    expect(await polygonV2.hasRole(minterRole, newMinterAddress)).to.be.equal(
      true
    )

    // master can't mint anymore
    const randomUserOne = await ethers.provider.getSigner(4).getAddress()
    await expect(
      polygonV2.connect(master).safeMint(randomUserOne, 5)
    ).to.be.revertedWith(`ChildMintableERC721: INSUFFICIENT_PERMISSIONS`)

    await polygonV2.connect(newMinter).safeMint(randomUserOne, 5)
  })
})
