const { expect } = require('chai')
const sigUtil = require('eth-sig-util')
const ethUtils = require('ethereumjs-util')
const { defaultFixture } = require('./_fixture')
const { loadFixture } = require('./helpers')

const domainType = [
  {
    name: 'name',
    type: 'string'
  },
  {
    name: 'version',
    type: 'string'
  },
  {
    name: 'verifyingContract',
    type: 'address'
  },
  {
    name: 'salt',
    type: 'bytes32'
  }
]

const metaTransactionType = [
  {
    name: 'nonce',
    type: 'uint256'
  },
  {
    name: 'from',
    type: 'address'
  },
  {
    name: 'functionSignature',
    type: 'bytes'
  }
]

describe('PolygonERC721_v3 token works', () => {
  it('Can Mint', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { polygonV3, master, deployer } = fixture
    const randomUserOne = ethers.provider.getSigner(4)
    const randomUserTwo = ethers.provider.getSigner(4)

    // Both deployer and master should be able to mint
    const userOneAddress = await randomUserOne.getAddress()
    await polygonV3.connect(deployer).safeMint(userOneAddress, 23)
    expect(await polygonV3.ownerOf(23)).to.be.equal(userOneAddress)

    await polygonV3.connect(master).safeMint(userOneAddress, 24)
    expect(await polygonV3.ownerOf(24)).to.be.equal(userOneAddress)

    // Normal user can't
    const userTwoAddress = await randomUserTwo.getAddress()
    await expect(
      polygonV3.connect(randomUserTwo).safeMint(userOneAddress, 24)
    ).to.be.revertedWith(`ChildMintableERC721: INSUFFICIENT_PERMISSIONS`)
  })

  it('Can set URI', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { polygonV3, master, deployer } = fixture
    const randomUser = ethers.provider.getSigner(4)

    // mint token 42
    await polygonV3
      .connect(deployer)
      .safeMint(await randomUser.getAddress(), 42)

    expect(await polygonV3.tokenURI(42)).to.be.equal(
      'https://nft.origin.eth/nft/42'
    )

    // deployer can change base URI
    await polygonV3.connect(deployer).setBaseURI('https://version3.com/')

    expect(await polygonV3.tokenURI(42)).to.be.equal('https://version3.com/42')

    expect(await polygonV3.contractURI()).to.be.equal(
      'https://version3.com/contract.json'
    )

    // minter(master) cannot change url
    await expect(
      polygonV3.connect(master).setBaseURI('https://boogers.com/')
    ).to.be.revertedWith(`ChildMintableERC721: INSUFFICIENT_PERMISSIONS`)

    // Normal user cannot change url
    const randomUserAddress = await randomUser.getAddress()
    await expect(
      polygonV3.connect(randomUser).setBaseURI('https://boogers.com/')
    ).to.be.revertedWith(`ChildMintableERC721: INSUFFICIENT_PERMISSIONS`)
  })

  it('Can mass mint', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { polygonV3, master, deployer } = fixture

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
    const tx = await polygonV3
      .connect(deployer)
      .massMint(userOneAddress, ids, adminAddress)
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash)
    // there should be 2 event for each token created
    expect(receipt.logs.length).to.be.equal(20)
    expect(await polygonV3.ownerOf(107)).to.be.equal(userOneAddress)

    // Admin can transfer after mint
    await polygonV3
      .connect(admin)
      .transferFrom(userOneAddress, userTwoAddress, 107)
    expect(await polygonV3.ownerOf(107)).to.be.equal(userTwoAddress)

    // minter(master) can massMint too
    const tx2 = await polygonV3
      .connect(master)
      .massMint(userOneAddress, [5, 6, 7], adminAddress)
    const receipt2 = await ethers.provider.getTransactionReceipt(tx2.hash)
    // there should be 2 event for each token created
    expect(receipt2.logs.length).to.be.equal(6)
    expect(await polygonV3.ownerOf(6)).to.be.equal(userOneAddress)

    // random addresses can't mint
    await randomUserTwo.getAddress()
    await expect(
      polygonV3
        .connect(randomUserTwo)
        .massMint(userOneAddress, ids, adminAddress)
    ).to.be.revertedWith(`ChildMintableERC721: INSUFFICIENT_PERMISSIONS`)

    await expect(
      polygonV3
        .connect(randomUserTwo)
        .transferFrom(userOneAddress, userTwoAddress, 108)
    ).to.be.revertedWith('ERC721: transfer caller is not owner nor approved')
  })

  it('Can change Owner', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { polygonV3, deployer } = fixture
    const prevOwnerAddress = await deployer.getAddress()
    const newOwner = ethers.provider.getSigner(4)
    const newOwnerAddress = await newOwner.getAddress()

    const adminRole = await polygonV3.DEFAULT_ADMIN_ROLE()
    expect(await polygonV3.hasRole(adminRole, prevOwnerAddress)).to.be.equal(
      true
    )
    expect(await polygonV3.hasRole(adminRole, newOwnerAddress)).to.be.equal(
      false
    )

    // Transfer ownership
    await polygonV3.connect(deployer).grantRole(adminRole, newOwnerAddress)
    await polygonV3.connect(deployer).revokeRole(adminRole, prevOwnerAddress)

    expect(await polygonV3.hasRole(adminRole, prevOwnerAddress)).to.be.equal(
      false
    )
    expect(await polygonV3.hasRole(adminRole, newOwnerAddress)).to.be.equal(
      true
    )

    // deployer can't change the base URI anymore
    await expect(
      polygonV3.connect(deployer).setBaseURI('https://boogers.com/')
    ).to.be.revertedWith(`ChildMintableERC721: INSUFFICIENT_PERMISSIONS`)

    await polygonV3.connect(newOwner).setBaseURI('https://version3.com/')
  })

  it('Can change Minter', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { polygonV3, master, deployer } = fixture
    const prevMinterAddress = await master.getAddress()
    const newMinter = ethers.provider.getSigner(4)
    const newMinterAddress = await newMinter.getAddress()

    const minterRole = await polygonV3.MINTER_ROLE()
    expect(await polygonV3.hasRole(minterRole, prevMinterAddress)).to.be.equal(
      true
    )
    expect(await polygonV3.hasRole(minterRole, newMinterAddress)).to.be.equal(
      false
    )

    // Transfer ownership
    await polygonV3.connect(deployer).grantRole(minterRole, newMinterAddress)
    await polygonV3.connect(deployer).revokeRole(minterRole, prevMinterAddress)

    expect(await polygonV3.hasRole(minterRole, prevMinterAddress)).to.be.equal(
      false
    )
    expect(await polygonV3.hasRole(minterRole, newMinterAddress)).to.be.equal(
      true
    )

    // master can't mint anymore
    const randomUserOne = await ethers.provider.getSigner(4).getAddress()
    await expect(
      polygonV3.connect(master).safeMint(randomUserOne, 5)
    ).to.be.revertedWith(`ChildMintableERC721: INSUFFICIENT_PERMISSIONS`)

    await polygonV3.connect(newMinter).safeMint(randomUserOne, 5)
  })

  it('Meta Transactions Work', async () => {
    const tokenId = 1337
    const fixture = await loadFixture(defaultFixture)
    const { polygonV3, deployer } = fixture
    const relayer = ethers.provider.getSigner(4)
    const relayerAddress = await relayer.getAddress()
    // We need to privkey for Alice so we're generating an account
    const alice = new ethers.Wallet(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes('alice'))
    )
    const aliceAddress = await alice.getAddress()
    const bob = ethers.provider.getSigner(5)
    const bobAddress = await bob.getAddress()
    const operator = ethers.provider.getSigner(6)
    const operatorAddress = await operator.getAddress()

    // Mint a token for Alice
    await polygonV3.connect(deployer).safeMint(aliceAddress, tokenId)

    // EZ way to build our tx calldata to approve operator for Alice's tokens
    const unsigned = await polygonV3
      .connect(alice)
      .populateTransaction.setApprovalForAll(operatorAddress, true)
    const nonce = await polygonV3.getNonce(aliceAddress)

    // ERC-712 domain
    const domainParams = {
      name: await polygonV3.name(),
      version: await polygonV3.ERC712_VERSION(),
      verifyingContract: polygonV3.address,
      salt:
        '0x' +
        (await polygonV3.getChainId())
          .toHexString()
          .substring(2)
          .padStart(64, '0')
    }

    // The MetaTransaction struct
    const metaTx = {
      nonce: nonce.toNumber(),
      from: aliceAddress,
      functionSignature: unsigned.data
    }

    // Args expected by signTypedData()
    const typedData = {
      data: {
        types: {
          EIP712Domain: domainType,
          MetaTransaction: metaTransactionType
        },
        domain: domainParams,
        primaryType: 'MetaTransaction',
        message: metaTx
      }
    }

    // Alice signs the meta tx
    const signature = sigUtil.signTypedData(
      ethUtils.toBuffer(alice.privateKey),
      typedData
    )

    const { r, s, v } = ethers.utils.splitSignature(signature)

    // Relayer sends the meta-tx on behalf of Alice
    const tx = await polygonV3
      .connect(relayer)
      .executeMetaTransaction(aliceAddress, unsigned.data, r, s, v)
    const receipt = await tx.wait()
    expect(receipt.status).to.equal(1)

    // Verify the MetaTransactionExecuted event
    expect(receipt.events[0].event).to.equal('MetaTransactionExecuted')
    const [e_userAddress, e_relayerAddress, e_functionSignature] =
      receipt.events[0].args
    expect(e_userAddress).to.equal(aliceAddress)
    expect(e_relayerAddress).to.equal(relayerAddress)
    expect(e_functionSignature).to.equal(unsigned.data)

    // Verify the ApprovalForAll event
    expect(receipt.events[1].event).to.equal('ApprovalForAll')
    const [e_owner, e_operator, e_approved] = receipt.events[1].args
    expect(e_owner).to.equal(aliceAddress)
    expect(e_operator).to.equal(operatorAddress)
    expect(e_approved).to.be.true

    // Operator can now transfer Alice's NFT
    const opTx = await polygonV3
      .connect(operator)
      ['safeTransferFrom(address,address,uint256)'](
        aliceAddress,
        bobAddress,
        tokenId
      )
    const opReceipt = await opTx.wait()
    expect(opReceipt.status).to.equal(1)

    // Verify the Transfer event
    expect(opReceipt.events[1].event).to.equal('Transfer')
    const [e_from, e_to, e_tokenId] = opReceipt.events[1].args
    expect(e_from).to.equal(aliceAddress)
    expect(e_to).to.equal(bobAddress)
    expect(e_tokenId).to.equal(tokenId)

    // Verify Bob now hodls the NFT
    const newOwner = await polygonV3.ownerOf(tokenId)
    expect(newOwner).to.equal(bobAddress)
  })
})
