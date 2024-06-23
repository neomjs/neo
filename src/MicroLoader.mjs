fetch('./neo-config.json').then(r => r.json()).then(d => {
    globalThis.Neo = {config: {...d}};
    import(d.mainPath)
})
