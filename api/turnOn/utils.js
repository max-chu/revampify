const axios = require('axios')
let client = require('../db')


// this main function duplicates the playlist and adds all songs into the database
async function setUpPlaylist(userId, playlistId, limit, access_token) {
    try {
        // add all songs from playlist into the database first
        const addedSongs = await addSongsFirst(playlistId, access_token);
        let result = await client.db("Playlists").collection("playlist")
                        .updateMany({ playlist_id: playlistId }, { $set: { 
                            on_off: true,
                            limit: limit,
                            songs: addedSongs        
                            }}); 
        
        // now create a duplicate of the playlist for the user. note: this duplicate will not be added to database
        let playlistName = (await client.db("Playlists").collection("playlist")
            .find({ playlist_id: playlistId }, { fields: { _id: 0, playlist_name: 1 }}).toArray())[0].playlist_name
        await createNewPlaylist(userId, playlistId, playlistName, access_token)
        return playlistId;
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
    }


// duplicates the playlist that has just been turned on
async function createNewPlaylist(userId, playlistId, playlistName, access_token) {
    try {
        // first create an empty playlist
        const response = await axios({
            method: "POST" ,
            url: ` https://api.spotify.com/v1/users/${userId}/playlists`,
            data: {
                name: playlistName + 'original'
            }, 
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        })
        let newPlaylistId = response.data.id;
        let songUris = await getUris(playlistId, access_token);

        // add all the songs into the duplicate of the original playlist on spotify
        await addOriginalTracks(newPlaylistId, songUris, access_token);
        return newPlaylistId;
    } catch (err) {
        console.log(err.response)
    }

}  


//get uris of all songs in the original playlist
async function getUris(playlistId, access_token) {
    try {
        const response = await axios({
            method: "get" ,
            url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks?market=CA&fields=items(track(uri))`,
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        })
        let info = response.data.items;
        let allUris = [];
        for (let i = 0; i < info.length; i++) {
            let songUri = info[i].track.uri;
            allUris.push(songUri);
        }        
        return allUris;
        
    } catch (err) {
        console.log(err.response)
    }
}


async function addOriginalTracks(duplicateId, allUris, access_token) {
    try {
        let uriInput = encodeURIComponent(allUris.toString());
        const response = await axios({
            method: "POST",
            url: ` 	https://api.spotify.com/v1/playlists/${duplicateId}/tracks?uris=${uriInput}`,
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        })
        return duplicateId; 
    } catch (err) {
        console.log(err.response)
    }

}

async function addSongsFirst(playlistId, access_token) {
    try {
        const response = await axios({
            method: "get",
            url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks?market=CA&fields=items(added_at%2Ctrack(name%2Cid%2Cartists(id)))`,
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        })
        let allInfo = response.data;
        let items = allInfo.items;
        let songs = [];
        let numberOfSongs = items.length;
        for (let i = 0; i < numberOfSongs; i++) {
            item = items[i];
            let artistsItems = item.track.artists; 
            let artistsId = [];
            for (let j = 0; j < artistsItems.length; j++) {
                artistsId.push(artistsItems[j].id);
            }
            let seedGenres = await getGenres(artistsId, access_token);
            let firstGenresString = '';
            if (seedGenres.length == 0) {
                firstGenresString = 'none';
            } else {
                firstGenresString = seedGenres[0].toString();
            }

            let seedTrack = items[i].track.id;
            let seedArtists = artistsId;
            let firstArtistString = artistsId[0].toString();
            let topFive = await nextFive(seedTrack, firstGenresString, firstArtistString, access_token);

            let song = {
                date_added: (items[i].added_at.split("T"))[0],
                song_id: seedTrack, // this is also the seed_tracks
                seed_artists: seedArtists, // all seeds are in string form
                seed_genres: seedGenres, // this causes the program to run slower
                is_original: true,
                is_archived: false,
                top_five: topFive
            };
            songs.push(song);
        }
      
        return songs;

    } catch(err) {
        console.log(err.response);
    }
}

// get the first 5 recommended songs based on seeds
async function getGenres(seed_artists, access_token) {
    let numArtists = seed_artists.length;
    let allGenres = [];
    for (i = 0; i < numArtists; i++) {
        try {
            const response = await axios({
                method: "get", 
                url: `https://api.spotify.com/v1/artists/${seed_artists[i]}`,
                headers: {
                    Authorization: `Bearer ${access_token}`
                }
            });
            let artistResponse = response.data;
            let artistGenres = artistResponse.genres;
            for (j = 0; j < artistGenres.length; j++) {
                allGenres.push(artistGenres[j]);
            }
        } catch (err) {
            console.log(err.response);
        }
    }

    let uniqueGenres = allGenres.reduce(function(a,b) {
        if (a.indexOf(b) < 0) a.push(b);
        return a;
    }, []);
    let topGenres = uniqueGenres.slice(0,5);
    return topGenres;
}

async function nextFive(seedTracks, seedGenres, seedArtists, access_token) {
    if (seedGenres != 'none') {
        try {
            const response = await axios({
                method: "get",
                url: `https://api.spotify.com/v1/recommendations?limit=15&market=CA&seed_artists=${seedArtists}&seed_genres=${seedGenres}&seed_tracks=${seedTracks}`,
                headers: {
                    Authorization: `Bearer ${access_token}`
                }
            })
            let allInfo = response.data;
            let tracksOnly = allInfo.tracks;
            let numTracks = tracksOnly.length;
            let song_ids = [];
            for (let i = 0; i < numTracks; i++) {
                song_ids.push(tracksOnly[i].id);
            };
            return song_ids; // returns an array of all 5 song ids
        } catch (err) {
        console.log(err.response)
    }
    } else {
        try {
            const response = await axios({
                method: "get",
                url: `https://api.spotify.com/v1/recommendations?limit=15&market=CA&seed_artists=${seedArtists}&seed_tracks=${seedTracks}`,
                headers: {
                    Authorization: `Bearer ${access_token}`
                }
            })
            let allInfo = response.data;
            let tracksOnly = allInfo.tracks;
            let numTracks = tracksOnly.length;
            let song_ids = [];
            for (let i = 0; i < numTracks; i++) {
                song_ids.push(tracksOnly[i].id);
            };
            return song_ids; // returns an array of all 5 song ids
        } catch (err) {
        console.log(err.response)
    }   
};
}



module.exports = {
    setUpPlaylist,
    getGenres,
    nextFive,
};