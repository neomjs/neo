Neo.overwrites = {
    Neo: {
        form: {
            field: {
                Text: {
                    labelPosition_   : 'inline',
                    showOptionalText_: true
                },
                ZipCode: {
                    maxLength: 5,
                    minLength: 5
                }
            }
        }
    }
}

export default Neo.overwrites;
