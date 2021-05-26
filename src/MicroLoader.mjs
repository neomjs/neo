fetch('./neo-config.json').then(r => r.json()).then(d => {
    self.Neo = {config: {...d}};
    import(d.mainPath);
});
