// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract TRTest3 is ERC1155, Ownable, ReentrancyGuard, Pausable {
    uint256 public constant MAX_MINT_QUANTITY = 100000;
    uint256 public constant MAX_PLATFORM_FEE = 1 ether;
    uint256 public constant MAX_BATCH_SIZE = 50; // New constant for batch size limit

    uint256 private _nextSongId;
    uint256 public platformFee;

    struct Song {
        string title;
        address artist;
        uint256 price;
        uint256 maxSupply;
        uint256 currentSupply;
        bool exists;
    }

    mapping(uint256 => Song) public songs;
    // Simplified artist to songs mapping
    mapping(address => uint256[]) public artistSongs;
    mapping(uint256 => string) private _tokenURIs;

    event SongCreated(
        uint256 indexed songId,
        string title,
        address indexed artist,
        uint256 price,
        uint256 maxSupply
    );

    event SongMinted(
        uint256 indexed songId,
        address indexed buyer,
        address indexed artist,
        uint256 quantity,
        uint256 totalPrice
    );

    event PlatformFeeUpdated(uint256 indexed oldFee, uint256 indexed newFee);
    event SongPriceUpdated(uint256 indexed songId, uint256 newPrice);
    event ArtistAddressChanged(
        uint256 indexed songId,
        address indexed oldArtist,
        address indexed newArtist
    );

    constructor(uint256 _platformFee) ERC1155("") Ownable(msg.sender) {
        require(_platformFee <= MAX_PLATFORM_FEE, "Platform fee too high");
        platformFee = _platformFee;
    }

    function createSong(
        string memory title,
        uint256 price,
        uint256 maxSupply,
        string memory tokenURI
    ) public whenNotPaused {
        require(bytes(title).length > 0, "Title cannot be empty");
        require(maxSupply > 0, "Max supply must be greater than 0");
        require(bytes(tokenURI).length > 0, "URI cannot be empty");

        uint256 newSongId = _nextSongId;
        _nextSongId += 1;

        songs[newSongId] = Song({
            title: title,
            artist: msg.sender,
            price: price,
            maxSupply: maxSupply,
            currentSupply: 0,
            exists: true
        });

        // Directly push new song ID to the artist's songs array
        artistSongs[msg.sender].push(newSongId);

        _tokenURIs[newSongId] = tokenURI;

        emit SongCreated(newSongId, title, msg.sender, price, maxSupply);
    }

    function mintSong(
        uint256 songId,
        uint256 quantity
    ) public payable nonReentrant whenNotPaused {
        require(
            quantity > 0 && quantity <= MAX_MINT_QUANTITY,
            "Invalid quantity"
        );

        Song storage song = songs[songId];
        require(song.exists, "Song does not exist");
        require(
            song.currentSupply + quantity <= song.maxSupply,
            "Would exceed max supply"
        );

        uint256 totalCost = (song.price * quantity) + platformFee;
        require(msg.value >= totalCost, "Insufficient payment");

        // Effects
        _mint(msg.sender, songId, quantity, "");
        song.currentSupply += quantity;

        // Interactions
        uint256 artistPayment = song.price * quantity;
        address artistAddress = song.artist;
        address payable buyer = payable(msg.sender);

        // Single external calls at the end
        payable(artistAddress).transfer(artistPayment);
        if (msg.value > totalCost) {
            buyer.transfer(msg.value - totalCost);
        }

        emit SongMinted(songId, msg.sender, song.artist, quantity, totalCost);
    }

    function mintBatchSongs(
        uint256[] memory songIds,
        uint256[] memory quantities
    ) public payable nonReentrant whenNotPaused {
        require(songIds.length == quantities.length, "Arrays length mismatch");
        require(songIds.length <= MAX_BATCH_SIZE, "Batch size too large");

        uint256 totalCost = platformFee;
        uint256[] memory costs = new uint256[](songIds.length);
        address[] memory artistAddresses = new address[](songIds.length);

        // Checks
        for (uint256 i = 0; i < songIds.length; i++) {
            require(
                quantities[i] > 0 && quantities[i] <= MAX_MINT_QUANTITY,
                "Invalid quantity"
            );
            Song storage song = songs[songIds[i]];
            require(song.exists, "Song does not exist");
            require(
                song.currentSupply + quantities[i] <= song.maxSupply,
                "Would exceed max supply"
            );
            costs[i] = song.price * quantities[i];
            artistAddresses[i] = song.artist;
            totalCost += costs[i];
        }

        require(msg.value >= totalCost, "Insufficient payment");

        // Effects
        for (uint256 i = 0; i < songIds.length; i++) {
            Song storage song = songs[songIds[i]];
            _mint(msg.sender, songIds[i], quantities[i], "");
            song.currentSupply += quantities[i];

            emit SongMinted(
                songIds[i],
                msg.sender,
                artistAddresses[i],
                quantities[i],
                costs[i]
            );
        }

        // Interactions
        for (uint256 i = 0; i < songIds.length; i++) {
            payable(artistAddresses[i]).transfer(costs[i]);
        }

        if (msg.value > totalCost) {
            payable(msg.sender).transfer(msg.value - totalCost);
        }
    }

    function updatePlatformFee(uint256 newFee) public onlyOwner {
        require(newFee <= MAX_PLATFORM_FEE, "Fee too high");
        uint256 oldFee = platformFee;
        platformFee = newFee;
        emit PlatformFeeUpdated(oldFee, newFee);
    }

    function updateSongPrice(uint256 songId, uint256 newPrice) public {
        require(
            songs[songId].artist == msg.sender || owner() == msg.sender,
            "Not artist or owner"
        );
        songs[songId].price = newPrice;
        emit SongPriceUpdated(songId, newPrice);
    }

    function uri(uint256 songId) public view override returns (string memory) {
        require(songs[songId].exists, "URI query for nonexistent token");
        return _tokenURIs[songId];
    }

    function getArtistSongs(
        address artist
    ) public view returns (uint256[] memory) {
        // Directly return the array of song IDs for the artist
        return artistSongs[artist];
    }

    function updateArtistAddress(uint256 songId, address newArtist) public {
        require(newArtist != address(0), "Invalid new artist address");
        Song storage song = songs[songId];
        require(song.exists, "Song does not exist");
        require(
            songs[songId].artist == msg.sender || owner() == msg.sender,
            "Not artist or owner"
        );

        address oldArtist = song.artist;
        song.artist = newArtist;

        // Remove song from old artist's array
        _removeSongFromArtist(oldArtist, songId);

        // Add song to new artist's array
        artistSongs[newArtist].push(songId);

        emit ArtistAddressChanged(songId, oldArtist, newArtist);
    }

    function _removeSongFromArtist(address artist, uint256 songId) private {
        uint256[] storage songsOfArtist = artistSongs[artist];
        for (uint256 i = 0; i < songsOfArtist.length; i++) {
            if (songsOfArtist[i] == songId) {
                // Replace the element to remove with the last element
                songsOfArtist[i] = songsOfArtist[songsOfArtist.length - 1];
                // Pop the last element
                songsOfArtist.pop();
                break;
            }
        }
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function withdrawPlatformFees() public onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        payable(owner()).transfer(balance);
    }

    function getSongDetails(
        uint256 songId
    )
        public
        view
        returns (
            string memory title,
            address artist,
            uint256 price,
            uint256 maxSupply,
            uint256 currentSupply,
            bool exists
        )
    {
        Song storage song = songs[songId];
        require(song.exists, "Song does not exist");
        return (
            song.title,
            song.artist,
            song.price,
            song.maxSupply,
            song.currentSupply,
            song.exists
        );
    }
}
