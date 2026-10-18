function acquisitionSource(value) {
    return value === 'shared' ? 'shared' : 'direct';
}

function logWalletEvent(event, platform, source) {
    console.log(JSON.stringify({ event, platform, source: acquisitionSource(source) }));
}

module.exports = {
    acquisitionSource,
    logWalletEvent
};
