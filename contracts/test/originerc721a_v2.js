import { funcSig, loadFixture } from './helpers'
import { defaultFixture } from './_fixture'
import { expect } from 'chai'
import { getMintSignature } from 'common/src/getMintSignature'
import { ethers } from 'hardhat'

const ROLE_DEFAULT_ADMIN_ROLE =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const ROLE_MINTER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER'))

describe('OriginERC721a_v2', () => {
  describe('Token with limited supply of 10', () => {
    let owner, minter, token, chainId
    const baseURI = 'https://nft.origin.eth/nft/'

    before(async () => {
      const { master, nft721a_v2, deployer } = await loadFixture(defaultFixture)
      token = nft721a_v2
      minter = master
      owner = deployer
      chainId = (await ethers.provider.getNetwork()).chainId
    })

    it('confirms supported interfaces', async () => {
      expect(await token.supportsInterface(funcSig('nothing'))).to.be.false
      // Standard check to see if ERC-165 is supported
      expect(
        await token.supportsInterface(funcSig('supportsInterface(bytes4)'))
      ).to.be.true
    })

    it('returns valid contract URI', async () => {
      expect(await token.contractURI()).to.equal(baseURI + 'contract.json')
      await token.connect(owner).setBaseURI('https://microsoft.com/')
      expect(await token.contractURI()).to.equal(
        'https://microsoft.com/contract.json'
      )
      await token.connect(owner).setBaseURI(baseURI)
    })

    it('sets up roles properly', async () => {
      const minterAddress = await minter.getAddress()
      const ownerAddress = await owner.getAddress()
      expect(await token.owner()).to.equal(ownerAddress)
      expect(await token.hasRole(ROLE_DEFAULT_ADMIN_ROLE, ownerAddress)).to.be
        .true
      expect(await token.hasRole(ROLE_MINTER, minterAddress)).to.be.true
    })

    it('allows a random account to mint with permission from minter', async () => {
      const buyerSigner = ethers.provider.getSigner(5)
      const buyer = await buyerSigner.getAddress()
      const block = await ethers.provider.getBlock()
      const price = 0
      const count = 2
      const mintLimit = 5
      const expires = block.timestamp + 5

      const { signature } = await getMintSignature({
        chainId,
        minter,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await token
        .connect(buyerSigner)
        .mint(buyer, count, price, mintLimit, expires, signature)

      expect(await token.ownerOf(1)).to.be.equal(buyer)
      expect(await token.ownerOf(2)).to.be.equal(buyer)
      expect(await token.totalSupply()).to.be.equal('2')
      expect(await token.tokenURI(1)).to.be.equal(`${baseURI}1`)
    })

    it('increments mint count', async () => {
      const buyerSigner = ethers.provider.getSigner(5)
      const buyer = await buyerSigner.getAddress()
      const block = await ethers.provider.getBlock()
      const price = 0
      const count = 1
      const mintLimit = 5
      const expires = block.timestamp + 5

      const { signature } = await getMintSignature({
        chainId,
        minter,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await token
        .connect(buyerSigner)
        .mint(buyer, count, price, mintLimit, expires, signature)

      expect(await token.ownerOf(3)).to.be.equal(buyer)
      expect(await token.totalSupply()).to.be.equal('3')
    })

    it('prevents excess mints', async () => {
      const buyerSigner = ethers.provider.getSigner(5)
      const buyer = await buyerSigner.getAddress()
      const block = await ethers.provider.getBlock()
      const price = 0
      const count = 4
      const mintLimit = 5
      const expires = block.timestamp + 5

      const { signature } = await getMintSignature({
        chainId,
        minter,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await expect(
        token
          .connect(buyerSigner)
          .mint(buyer, count, price, mintLimit, expires, signature)
      ).to.be.revertedWith('Max mint limit')
    })

    it('prevents expired mints', async () => {
      const buyerSigner = ethers.provider.getSigner(5)
      const buyer = await buyerSigner.getAddress()
      const block = await ethers.provider.getBlock()
      const price = 0
      const count = 1
      const mintLimit = 5
      const expires = block.timestamp - 5

      const { signature } = await getMintSignature({
        chainId,
        minter,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await expect(
        token
          .connect(buyerSigner)
          .mint(buyer, count, price, mintLimit, expires, signature)
      ).to.be.revertedWith('Signature expired')
    })

    it('prevents mints with not enough value', async () => {
      const buyerSigner = ethers.provider.getSigner(5)
      const buyer = await buyerSigner.getAddress()
      const block = await ethers.provider.getBlock()
      const price = ethers.utils.parseEther('1')
      const count = 1
      const mintLimit = 5
      const expires = block.timestamp + 5

      const { signature } = await getMintSignature({
        chainId,
        minter,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await expect(
        token
          .connect(buyerSigner)
          .mint(buyer, count, price, mintLimit, expires, signature)
      ).to.be.revertedWith('Not enough ETH')
    })

    it('prevents mints with wrong signer', async () => {
      const buyerSigner = ethers.provider.getSigner(5)
      const buyer = await buyerSigner.getAddress()
      const block = await ethers.provider.getBlock()
      const price = 0
      const count = 1
      const mintLimit = 5
      const expires = block.timestamp + 5

      const { signature } = await getMintSignature({
        chainId,
        minter: buyerSigner,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await expect(
        token
          .connect(buyerSigner)
          .mint(buyer, count, price, mintLimit, expires, signature)
      ).to.be.revertedWith('Invalid signer')
    })

    it('allows all tokens to be minted', async () => {
      const buyerSigner = ethers.provider.getSigner(5)
      const buyer = await buyerSigner.getAddress()
      const block = await ethers.provider.getBlock()
      const price = 0
      const count = 7
      const mintLimit = 10
      const expires = block.timestamp + 5

      const { signature } = await getMintSignature({
        chainId,
        minter,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await token
        .connect(buyerSigner)
        .mint(buyer, count, price, mintLimit, expires, signature)

      expect(await token.ownerOf(10)).to.be.equal(buyer)
      expect(await token.totalSupply()).to.be.equal('10')
    })

    it('prevents further mints once supply is exhausted', async () => {
      const buyerSigner = ethers.provider.getSigner(5)
      const buyer = await buyerSigner.getAddress()
      const block = await ethers.provider.getBlock()
      const price = 0
      const count = 1
      const mintLimit = 20
      const expires = block.timestamp + 5

      const { signature } = await getMintSignature({
        chainId,
        minter,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await expect(
        token
          .connect(buyerSigner)
          .mint(buyer, count, price, mintLimit, expires, signature)
      ).to.be.revertedWith('Max supply exceeded')
    })
  })

  describe('Payment splits', () => {
    let minter, owner, token, chainId

    before(async () => {
      const { master, deployer } = await loadFixture(defaultFixture)

      const erc721aFactory = await ethers.getContractFactory('OriginERC721a_v2')
      const masterAddr = await master.getAddress()
      const deployerAddr = await deployer.getAddress()
      const nft721a = await erc721aFactory
        .connect(deployer)
        .deploy(
          'Origin NFT',
          'ORIGIN',
          'https://nft.origin.eth/nft/',
          10,
          masterAddr,
          [masterAddr, deployerAddr],
          [1, 1]
        )

      token = nft721a
      minter = master
      owner = deployer
      chainId = (await ethers.provider.getNetwork()).chainId
    })

    it('allows payment shares to be released', async () => {
      const buyerSigner = ethers.provider.getSigner(5)
      const buyer = await buyerSigner.getAddress()
      const block = await ethers.provider.getBlock()
      const price = ethers.utils.parseEther('0.01')
      const minterAddr = await minter.getAddress()
      const ownerAddr = await owner.getAddress()
      const count = 1
      const mintLimit = 5
      const expires = block.timestamp + 5

      const { signature } = await getMintSignature({
        chainId,
        minter,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await token
        .connect(buyerSigner)
        .mint(buyer, count, price, mintLimit, expires, signature, {
          value: price
        })

      expect(await token.ownerOf(1)).to.be.equal(buyer)

      const balanceBefore = await ethers.provider.getBalance(minterAddr)
      const tx = await token.connect(minter)['release(address)'](minterAddr)
      const receipt = await ethers.provider.getTransactionReceipt(tx.hash)
      expect(receipt.status).to.equal(1)
      const balanceAfter = await ethers.provider.getBalance(minterAddr)

      const balanceDiff = balanceAfter
        .sub(balanceBefore)
        .add(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice))

      expect(balanceDiff).to.be.equal(price.div(2))

      const ownerBalanceBefore = await ethers.provider.getBalance(ownerAddr)
      // Minter is sending because anyone can call it
      const ownerTx = await token.connect(minter)['release(address)'](ownerAddr)
      const ownerReceipt = await ethers.provider.getTransactionReceipt(
        ownerTx.hash
      )
      expect(ownerReceipt.status).to.equal(1)
      const ownerBalanceAfter = await ethers.provider.getBalance(ownerAddr)

      const ownerBalanceDiff = ownerBalanceAfter.sub(ownerBalanceBefore)

      expect(ownerBalanceDiff).to.be.equal(price.div(2))
    })
  })
})
