const { expect } = require('chai')
const { defaultFixture } = require('./_fixture')
const { getSigForMintV5, loadFixture } = require('./helpers')

const ROLE_DEFAULT_ADMIN_ROLE =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
// NOTE: this contract uses a different role hash for minter
const ROLE_MINTER = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('MINTER_ROLE')
)

describe('OriginERC721V6Factory', () => {
  describe('Token with limited supply of 10', () => {
    let owner, minter, minterAddress, token
    const baseURI = 'https://nft.mikeshultz.com/nft/'

    it('Can create token with a minter', async () => {
      const { masterAddr } = await getNamedAccounts()
      const { factoryV6, master, nftv6 } = await loadFixture(defaultFixture)

      owner = master
      minter = ethers.provider.getSigner(4)
      const randomUser = ethers.provider.getSigner(1)
      const randomAddress = await randomUser.getAddress()
      minterAddress = await minter.getAddress()

      const res = await factoryV6
        .connect(master)
        .createTokenWithMinter(
          "Mike's ART",
          'MART',
          baseURI,
          10,
          minterAddress,
          [minterAddress],
          [1]
        )

      const tx = await res.wait()
      const createTokenEvent = tx.events.find((e) => e.event === 'CreateToken')

      token = nftv6.attach(createTokenEvent.args.addr)
      expect(await token.symbol()).to.be.equal('MART')

      const ownerRole = await token.DEFAULT_ADMIN_ROLE()
      expect(await token.hasRole(ownerRole, masterAddr)).to.be.equal(true)
      expect(await token.hasRole(ownerRole, randomAddress)).to.be.equal(false)

      // Both deployer and minter should have the minter role
      const minterAuthorizer = await token.MINTER_ROLE()
      expect(await token.hasRole(minterAuthorizer, minterAddress)).to.be.true
      expect(await token.hasRole(minterAuthorizer, randomAddress)).to.be.equal(
        false
      )

      expect(await token.baseURI()).to.be.equal(baseURI)
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

      const sig = await getSigForMintV5({
        signer: minter,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await token
        .connect(buyerSigner)
        .mint(buyer, count, price, mintLimit, expires, sig)

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

      const sig = await getSigForMintV5({
        signer: minter,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await token
        .connect(buyerSigner)
        .mint(buyer, count, price, mintLimit, expires, sig)

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

      const sig = await getSigForMintV5({
        signer: minter,
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
          .mint(buyer, count, price, mintLimit, expires, sig)
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

      const sig = await getSigForMintV5({
        signer: minter,
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
          .mint(buyer, count, price, mintLimit, expires, sig)
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

      const sig = await getSigForMintV5({
        signer: minter,
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
          .mint(buyer, count, price, mintLimit, expires, sig)
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

      const sig = await getSigForMintV5({
        signer: buyerSigner,
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
          .mint(buyer, count, price, mintLimit, expires, sig)
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

      const sig = await getSigForMintV5({
        signer: minter,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await token
        .connect(buyerSigner)
        .mint(buyer, count, price, mintLimit, expires, sig)

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

      const sig = await getSigForMintV5({
        signer: minter,
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
          .mint(buyer, count, price, mintLimit, expires, sig)
      ).to.be.revertedWith('Max supply exceeded')
    })
  })

  describe.skip('Token with no supply limit', () => {
    let minter, token

    it('Can create token with a minter', async () => {
      const { masterAddr } = await getNamedAccounts()
      const { factoryV6, master, nftv6 } = await loadFixture(defaultFixture)

      minter = ethers.provider.getSigner(4)
      const minterAddress = await minter.getAddress()

      const res = await factoryV6
        .connect(master)
        .createTokenWithMinter(
          minterAddress,
          "Mike's ART",
          'MART',
          'https://nft.mikeshultz.com/nft/',
          0
        )

      const tx = await res.wait()
      const createTokenEvent = tx.events.find((e) => e.event === 'CreateToken')

      token = nftv6.attach(createTokenEvent.args.addr)
      const symbol = await token.symbol()
      expect(symbol).to.be.equal('MART')

      const ownerRole = await token.DEFAULT_ADMIN_ROLE()
      const isOwner = await token.hasRole(ownerRole, masterAddr)
      expect(isOwner).to.be.equal(true)

      // Both deployer and minter should have the minter role
      const mintAuthorizer = await token.MINTER_ROLE()
      expect(await token.hasRole(mintAuthorizer, masterAddr)).to.be.true
      expect(await token.hasRole(mintAuthorizer, minterAddress)).to.be.true
    })

    it('allows a random account to mint with permission from minter', async () => {
      const buyer = ethers.provider.getSigner(5)
      const buyerAddress = await buyer.getAddress()
      const block = await ethers.provider.getBlock()
      const net = await ethers.provider.getNetwork()

      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          [
            'uint',
            'address',
            'address',
            'uint256[]',
            'uint256',
            'uint256',
            'uint256'
          ],
          [
            net.chainId,
            token.address,
            buyerAddress,
            [23],
            0,
            block.timestamp - 5,
            block.timestamp + 5
          ]
        )
      )
      const sig = await minter.signMessage(ethers.utils.arrayify(hash))

      await token
        .connect(buyer)
        .mintTokenIDs(
          buyerAddress,
          [23],
          0,
          block.timestamp - 5,
          block.timestamp + 5,
          sig
        )

      expect(await token.ownerOf(23)).to.be.equal(buyerAddress)
    })

    it('prevents a random account from minting without permission from minter', async () => {
      const buyer = ethers.provider.getSigner(5)
      const buyerAddress = await buyer.getAddress()
      const block = await ethers.provider.getBlock()
      const net = await ethers.provider.getNetwork()

      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          [
            'uint',
            'address',
            'address',
            'uint256[]',
            'uint256',
            'uint256',
            'uint256'
          ],
          [
            net.chainId,
            token.address,
            buyerAddress,
            [24],
            0,
            block.timestamp - 5,
            block.timestamp + 5
          ]
        )
      )
      const sig = await buyer.signMessage(ethers.utils.arrayify(hash))

      await expect(
        token
          .connect(buyer)
          .mintTokenIDs(
            buyerAddress,
            [24],
            0,
            block.timestamp - 5,
            block.timestamp + 5,
            sig
          )
      ).to.be.revertedWith('Invalid signature')
    })

    it('prevents a random account from minting too early', async () => {
      const buyer = ethers.provider.getSigner(5)
      const buyerAddress = await buyer.getAddress()
      const block = await ethers.provider.getBlock()
      const net = await ethers.provider.getNetwork()

      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          [
            'uint',
            'address',
            'address',
            'uint256[]',
            'uint256',
            'uint256',
            'uint256'
          ],
          [
            net.chainId,
            token.address,
            buyerAddress,
            [24],
            0,
            block.timestamp + 2,
            block.timestamp + 5
          ]
        )
      )
      const sig = await minter.signMessage(ethers.utils.arrayify(hash))

      await expect(
        token
          .connect(buyer)
          .mintTokenIDs(
            buyerAddress,
            [24],
            0,
            block.timestamp + 2,
            block.timestamp + 5,
            sig
          )
      ).to.be.revertedWith('Too early')
    })

    it('prevents a random account from minting too late', async () => {
      const buyer = ethers.provider.getSigner(5)
      const buyerAddress = await buyer.getAddress()
      const block = await ethers.provider.getBlock()
      const net = await ethers.provider.getNetwork()

      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          [
            'uint',
            'address',
            'address',
            'uint256[]',
            'uint256',
            'uint256',
            'uint256'
          ],
          [
            net.chainId,
            token.address,
            buyerAddress,
            [24],
            0,
            block.timestamp - 5,
            block.timestamp - 2
          ]
        )
      )
      const sig = await minter.signMessage(ethers.utils.arrayify(hash))

      await expect(
        token
          .connect(buyer)
          .mintTokenIDs(
            buyerAddress,
            [24],
            0,
            block.timestamp - 5,
            block.timestamp - 2,
            sig
          )
      ).to.be.revertedWith('Too late')
    })

    it('prevents a random account from minting wrong tokenID', async () => {
      const buyer = ethers.provider.getSigner(5)
      const buyerAddress = await buyer.getAddress()
      const block = await ethers.provider.getBlock()
      const net = await ethers.provider.getNetwork()

      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          [
            'uint',
            'address',
            'address',
            'uint256[]',
            'uint256',
            'uint256',
            'uint256'
          ],
          [
            net.chainId,
            token.address,
            buyerAddress,
            [24],
            0,
            block.timestamp - 5,
            block.timestamp + 5
          ]
        )
      )
      const sig = await minter.signMessage(ethers.utils.arrayify(hash))

      await expect(
        token
          .connect(buyer)
          .mintTokenIDs(
            buyerAddress,
            [25],
            0,
            block.timestamp - 5,
            block.timestamp + 5,
            sig
          )
      ).to.be.revertedWith('Invalid signature')
    })

    it('prevents a random account from minting too late', async () => {
      const buyer = ethers.provider.getSigner(5)
      const buyerAddress = await buyer.getAddress()
      const block = await ethers.provider.getBlock()
      const net = await ethers.provider.getNetwork()

      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          [
            'uint',
            'address',
            'address',
            'uint256[]',
            'uint256',
            'uint256',
            'uint256'
          ],
          [
            net.chainId,
            token.address,
            buyerAddress,
            [24],
            0,
            block.timestamp - 5,
            block.timestamp - 2
          ]
        )
      )
      const sig = await minter.signMessage(ethers.utils.arrayify(hash))

      await expect(
        token
          .connect(buyer)
          .mintTokenIDs(
            buyerAddress,
            [24],
            0,
            block.timestamp - 5,
            block.timestamp - 2,
            sig
          )
      ).to.be.revertedWith('Too late')
    })

    it('prevents a random account from minting wrong tokenID', async () => {
      const buyer = ethers.provider.getSigner(5)
      const buyerAddress = await buyer.getAddress()
      const block = await ethers.provider.getBlock()
      const net = await ethers.provider.getNetwork()

      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          [
            'uint',
            'address',
            'address',
            'uint256[]',
            'uint256',
            'uint256',
            'uint256'
          ],
          [
            net.chainId,
            token.address,
            buyerAddress,
            [24],
            0,
            block.timestamp - 5,
            block.timestamp + 5
          ]
        )
      )
      const sig = await minter.signMessage(ethers.utils.arrayify(hash))

      await expect(
        token
          .connect(buyer)
          .mintTokenIDs(
            buyerAddress,
            [25],
            0,
            block.timestamp - 5,
            block.timestamp + 5,
            sig
          )
      ).to.be.revertedWith('Invalid signature')
    })

    it('prevents minting with a token count', async () => {
      const buyer = ethers.provider.getSigner(5)
      const buyerAddress = await buyer.getAddress()
      const block = await ethers.provider.getBlock()
      const net = await ethers.provider.getNetwork()
      const nonce = 123

      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['uint', 'address', 'address', 'uint256', 'uint256', 'uint256'],
          [net.chainId, token.address, buyerAddress, 2, 0, nonce]
        )
      )
      const sig = await minter.signMessage(ethers.utils.arrayify(hash))

      await expect(
        token.connect(buyer).mint(buyerAddress, 2, 0, nonce, sig)
      ).to.be.revertedWith('Wrong contract type')
    })
  })

  describe('Payment splits', () => {
    let minter, owner, token

    before(async () => {
      const { factoryV6, master, deployer, nftv6 } = await loadFixture(
        defaultFixture
      )

      const minterAddress = await master.getAddress()

      minter = master
      owner = deployer

      const res = await factoryV6
        .connect(deployer)
        .createTokenWithMinter(
          "Mike's ART",
          'MART',
          'https://nft.mikeshultz.com/nft/',
          10,
          minterAddress,
          [minterAddress, await owner.getAddress()],
          [1, 3]
        )

      const tx = await res.wait()
      const createTokenEvent = tx.events.find((e) => e.event === 'CreateToken')

      token = nftv6.attach(createTokenEvent.args.addr)
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

      const sig = await getSigForMintV5({
        signer: minter,
        token,
        buyer,
        count,
        price,
        mintLimit,
        expires
      })

      await token
        .connect(buyerSigner)
        .mint(buyer, count, price, mintLimit, expires, sig, { value: price })

      expect(await token.ownerOf(1)).to.be.equal(buyer)

      const balanceBefore = await ethers.provider.getBalance(minterAddr)
      const tx = await token.connect(minter)['release(address)'](minterAddr)
      const receipt = await ethers.provider.getTransactionReceipt(tx.hash)
      expect(receipt.status).to.equal(1)
      const balanceAfter = await ethers.provider.getBalance(minterAddr)
      const balanceDiff = balanceAfter
        .sub(balanceBefore)
        .add(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice))
      expect(balanceDiff).to.be.equal(price.div(4))

      const ownerBalanceBefore = await ethers.provider.getBalance(ownerAddr)
      // Minter is sending because anyone can call it
      const ownerTx = await token.connect(minter)['release(address)'](ownerAddr)
      const ownerReceipt = await ethers.provider.getTransactionReceipt(
        ownerTx.hash
      )
      expect(ownerReceipt.status).to.equal(1)
      const ownerBalanceAfter = await ethers.provider.getBalance(ownerAddr)

      const ownerBalanceDiff = ownerBalanceAfter.sub(ownerBalanceBefore)

      expect(ownerBalanceDiff).to.be.equal(price.mul(3).div(4))
    })
  })
})

async function funcSig(sig) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(sig)).slice(0, 10)
}
