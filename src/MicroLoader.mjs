import(new URL('./neo-config.json', document.baseURI).href, {with: {type: 'json'}}).then(({default: d}) => {
    globalThis.Neo = {config: {...d}};
    import(d.mainPath)
})
