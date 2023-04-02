require('dotenv').config()

// const { Pool } = require('pg')
// const pool = new Pool({ connectionString: process.env.PG_CONNECTION_STRING, ssl: true })

const ws = require('ws')
const crypto = require('crypto')

const games = {}
const clients = {}

const wss = new ws.Server(
    {
        port: process.env.PORT || 8000,
    },
    () => {
        console.log('OK!')
    }
)

wss.on('connection', (ws) => {
    const uuid = crypto.randomUUID()
    clients[uuid] = {
        client: ws,
    }

    ws.on('message', (data) => {
        data = JSON.parse(data)
        Object.values(clients).find((c) => c.client === ws).username = data.username

        switch (data.event) {
            case 'create':
                createNewGame(ws, data)
                break
            case 'join':
                joinExistingGame(ws, data)
                break
            case 'start':
                startTheGame(ws, data)
                break
            case 'ttt-turn':
                TTTTurn(ws, data)
                break
        }
    })
})

function createNewGame(client, data) {
    const id = crypto.randomUUID()
    games[id] = {
        host: client,
        game: {
            id: id,
            game: data.game,
            hostName: data.username,
            statusCode: 'created',
        },
    }
    client.send(JSON.stringify(games[id].game))
}

function joinExistingGame(client, data) {
    if (games[data.code]) {
        games[data.code].guest = client
        games[data.code].game.guestName = data.username
        games[data.code].game.statusCode = 'ready'

        games[data.code].guest.send(JSON.stringify(games[data.code].game))
        games[data.code].host.send(JSON.stringify(games[data.code].game))
    } else {
        client.send(JSON.stringify({ error: 'Wrong code.' }))
    }
}

function startTheGame(client, data) {
    games[data.id].game.state = Array.from(Array(9))
    games[data.id].game.turn = 'x'
    games[data.id].game.statusCode = 'started'
    games[data.id].guest.send(JSON.stringify(games[data.id].game))
    client.send(JSON.stringify(games[data.id].game))
}

const TTTwinningConditions = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
]
function TTThandleResultValidation(gameState) {
    let roundWon = false,
        a,
        b,
        c
    for (let i = 0; i <= 7; i++) {
        const winCondition = TTTwinningConditions[i]
        a = gameState[winCondition[0]]
        b = gameState[winCondition[1]]
        c = gameState[winCondition[2]]
        if (a === undefined || b === undefined || c === undefined) {
            continue
        }
        if (a === b && b === c) {
            roundWon = true
            break
        }
    }
    return roundWon && a
}

function TTTTurn(client, data) {
    const game = games[data.id].game
    if (game.statusCode === 'over') {
        games[data.id].guest.send(JSON.stringify(game))
        games[data.id].host.send(JSON.stringify(game))
    } else {
        const cellId = data.cellId
        if (data.username === game.hostName) {
            if (game.turn === 'o') {
                client.send(JSON.stringify({ error: `${game.guestName}'s turn.` }))
            } else {
                if (game.state[cellId]) {
                    client.send(JSON.stringify({ error: "Can't turn again here." }))
                } else {
                    game.state[cellId] = 'x'
                    game.turn = 'o'
                    games[data.id].guest.send(JSON.stringify(game))
                    games[data.id].host.send(JSON.stringify(game))
                }
            }
        } else {
            if (game.turn === 'x') {
                client.send(JSON.stringify({ error: `${game.hostName}'s turn.` }))
            } else {
                if (game.state[cellId]) {
                    client.send(JSON.stringify({ error: "Can't turn again here." }))
                } else {
                    game.state[cellId] = 'o'
                    game.turn = 'x'
                    games[data.id].guest.send(JSON.stringify(game))
                    games[data.id].host.send(JSON.stringify(game))
                }
            }
        }
        const result = TTThandleResultValidation(game.state)
        if (result) {
            if (result === 'x') {
                game.winner = game.hostName
            } else {
                game.winner = game.guestName
            }
            game.statusCode = 'over'
            games[data.id].guest.send(JSON.stringify(game))
            games[data.id].host.send(JSON.stringify(game))
        }
    }
}
