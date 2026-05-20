function LegacyStore() {
    this.items = [];
}

LegacyStore.prototype.add = function(item) {
    this.items.push(item);
};
