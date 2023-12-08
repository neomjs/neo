Neo.overwrites = {
    Neo: {
        form: {
            field: {
                Base: {
                    delayable: {
                        fireChangeEvent    : null,
                        fireUserChangeEvent: null
                    }
                }
            }
        }
    }
}

export default Neo.overwrites;
