const { expect, assert } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")
/* global BigInt */

!developmentChains.includes(network.name)
	? describe.skip
	: describe("Marketplace Unit tests", function () {
			let deployer, player, deployerMarketplace, nft, tokenId, basicNft, basicTokenId, price
			beforeEach(async () => {
				price = ethers.utils.parseEther("0.4")
				deployer = (await getNamedAccounts()).deployer
				player = (await getNamedAccounts()).player
				await deployments.fixture(["all"])
				deployerMarketplace = await ethers.getContract("PandaMarket", deployer)
				playerMarketplace = await ethers.getContract("PandaMarket", player)
				nft = await ethers.getContract("PandaNft", deployer)
				// nftPlayer = await ethers.getContract("PandaNft",player)
				basicNft = await ethers.getContract("BasicNft", deployer)
				await nft.mintNft()
				// await nftPlayer.mintNft()
				await basicNft.mintNft()
				tokenId = await nft.getCounter()
				basicTokenId = await basicNft.getTokenCounter()
				// tokenIdPlayer = await nftPlayer.getCounter()
			})

			describe("listNft test", async () => {
				it("Reverts if value is zero", async () => {
					await nft.approve(deployerMarketplace.address, tokenId)
					await expect(
						deployerMarketplace.listNft(nft.address, tokenId, 0),
					).to.be.revertedWith("PandaMarket__PriceShouldNotBeZero")
				})

				it("Reverts if notOwner try to list", async () => {
					await nft.approve(deployerMarketplace.address, tokenId)
					await expect(
						playerMarketplace.listNft(nft.address, tokenId, price),
					).to.be.revertedWith("PandaMarket__NotTheOwner")
				})
				it("Reverts if Already Listed", async () => {
					await nft.approve(deployerMarketplace.address, tokenId)
					const tx = await deployerMarketplace.listNft(
						nft.address,
						tokenId,
						price,
					)
					await tx.wait(1)
					await expect(
						deployerMarketplace.listNft(nft.address, tokenId, price),
					).to.be.revertedWith("PandaMarket__AlreadyListed")
				})
				it("Reverts if not approved", async () => {
					await expect(
						deployerMarketplace.listNft(nft.address, tokenId, price),
					).to.be.revertedWith("PandaMarket__NotApproved")
				})
				it("Adds to listing", async () => {
					await nft.approve(deployerMarketplace.address, tokenId)
					await deployerMarketplace.listNft(nft.address, tokenId, price)
                    const listed = await deployerMarketplace.getListed(nft.address, tokenId)
                    assert.equal(listed.price.toString(), price.toString())
                    assert.equal(deployer,listed.seller)
				})
                it("Emits event", async () => {
					await nft.approve(deployerMarketplace.address, tokenId)
                    await expect(deployerMarketplace.listNft(nft.address, tokenId, price)).to.emit(deployerMarketplace,"NftListed")
                })
			})

			describe("buyNft tests", () => {
				it("Reverts if not listed", async () => {
					await nft.approve(deployerMarketplace.address, tokenId)
					await expect(playerMarketplace.buyNft(nft.address, tokenId,{value:price})).to.be.revertedWith("PandaMarket__NotListed")
				})

				it("Reverts if value sent is less than price", async () => {
					const lowerPrice = ethers.utils.parseEther("0.2")
					await nft.approve(deployerMarketplace.address, tokenId)
					await deployerMarketplace.listNft(nft.address, tokenId, price)
					await expect(playerMarketplace.buyNft(nft.address, tokenId,{value:lowerPrice})).to.be.revertedWith("PandaMarket__NotEnoughFunds")
				})

				it("Listing is deleted after sale", async () => {
					await nft.approve(deployerMarketplace.address, tokenId)
					await deployerMarketplace.listNft(nft.address, tokenId, price)
					await playerMarketplace.buyNft(nft.address, tokenId,{value:price})
					const listedGot = await deployerMarketplace.getListed(nft.address,tokenId)
					assert.equal(listedGot.price.toString(),"0")
				})
				it("IF Royalty Enabled:- Tranfers NFT correctly", async () => {
					await nft.approve(deployerMarketplace.address, tokenId)
					const previousOwner = await nft.ownerOf(tokenId)
					await deployerMarketplace.listNft(nft.address, tokenId, price)
					await playerMarketplace.buyNft(nft.address, tokenId,{value:price})
					const currentOwner = await nft.ownerOf(tokenId)
					assert.equal(previousOwner, deployer)
					assert.equal(currentOwner, player)
				})
				it("IF Royalty Enabled:- Seller Proceeds updated", async () => {
					const player2 = (await getNamedAccounts()).player2
					const player2Marketplace = await ethers.getContract("PandaMarket", player2)
					
					const nftPlayer = await ethers.getContract("PandaNft",player)
					await nftPlayer.mintNft()
					const tokenIdPlayer = await nftPlayer.getCounter()
					
					const previousProceeds = await playerMarketplace.getProceeds(player)
					await nftPlayer.approve(playerMarketplace.address, tokenIdPlayer)
					
					await playerMarketplace.listNft(nftPlayer.address, tokenIdPlayer, price)
					await player2Marketplace.buyNft(nftPlayer.address, tokenIdPlayer,{value:price})
					
					const currentProceeds = await playerMarketplace.getProceeds(player)
					const creatorFee = await playerMarketplace.getRoyaltyData(nftPlayer.address,tokenIdPlayer,price)
					const marketFee = await playerMarketplace.getMarketFee(price)
					const expectedProceeds = previousProceeds + price - creatorFee[1] - marketFee
					
					assert.equal(currentProceeds.toString(), expectedProceeds.toString())
				})
				it("IF Royalty Enabled:- Creator Proceeds updated", async () => {
					const player2 = (await getNamedAccounts()).player2
					const player2Marketplace = await ethers.getContract("PandaMarket", player2)
					
					const nftPlayer = await ethers.getContract("PandaNft",player)
					await nftPlayer.mintNft()
					const tokenIdPlayer = await nftPlayer.getCounter()
					
					const previousProceeds = await playerMarketplace.getProceeds(deployer)
					await nftPlayer.approve(playerMarketplace.address, tokenIdPlayer)
					
					await playerMarketplace.listNft(nftPlayer.address, tokenIdPlayer, price)
					await player2Marketplace.buyNft(nftPlayer.address, tokenIdPlayer,{value:price})

					const currentOwnerProceeds = await deployerMarketplace.getProceeds(deployer)
					const creatorFee = await playerMarketplace.getRoyaltyData(nftPlayer.address,tokenIdPlayer,price)
					const expectedCreatorProceeds = BigInt(creatorFee[1]) + BigInt(previousProceeds)
					assert.equal(currentOwnerProceeds.toString(), expectedCreatorProceeds.toString())
				})
				it("IF Royalty Enabled:- MarketTreasury is updated", async ()=> {
					const player2 = (await getNamedAccounts()).player2
					const player2Marketplace = await ethers.getContract("PandaMarket", player2)
					
					const nftPlayer = await ethers.getContract("PandaNft",player)
					await nftPlayer.mintNft()
					const tokenIdPlayer = await nftPlayer.getCounter()

					const previousTreasuryBalance = await playerMarketplace.getTreasuryBalance()
					await nftPlayer.approve(playerMarketplace.address, tokenIdPlayer)
					
					await playerMarketplace.listNft(nftPlayer.address, tokenIdPlayer, price)
					await player2Marketplace.buyNft(nftPlayer.address, tokenIdPlayer,{value:price})

					const marketFee = await playerMarketplace.getMarketFee(price)
					const currentTreasuryBalance = await playerMarketplace.getTreasuryBalance()
					const expectedTreasuryBalance = BigInt(previousTreasuryBalance) + BigInt(marketFee)
					assert.equal(expectedTreasuryBalance.toString(),currentTreasuryBalance.toString())
				})
				it("Emits Event", async () => {
					await nft.approve(deployerMarketplace.address, tokenId)
					const previousOwner = await nft.ownerOf(tokenId)
					await deployerMarketplace.listNft(nft.address, tokenId, price)
					await expect(playerMarketplace.buyNft(nft.address, tokenId,{value:price})).to.emit(playerMarketplace,"NftBought")
				})
			})
	  })
