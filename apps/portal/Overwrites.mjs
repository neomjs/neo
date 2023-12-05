Neo.overwrites = {
    Neo: {
        button: {
            Base: {
                editRoute: false
            }
        },
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
