fetch('./neo-config.json').then(response => response.json()).then(data => {
    self.Neo = {config: {}};
    Object.assign(Neo.config, data);
    import(data.mainPath);
});
