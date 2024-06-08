const VaultGS = (function () {
    /*
    {
        key: ********************,
        action: create,
        type: table,
        table: Users
    }
    */

    function createTable(ss, data) {
        var name = data.table
        validateString("Table name", name)
        validateUniqueSheet(ss, name)
        var ws = ss.insertSheet(name)
        formatSheet(ws)
        DataTypes.integer.formatColumn(ws, 1, "id", true)
        return { message: `Created table ${name}` }
    }

    /*
    {
    
        key: ********************,
        action: create,
        type: column,
        table: Users
        column: Age,
        dataType: Integer,
        required: false
    }
    */

    function createColumn(ss, data) {
        validateString("Table name", data.table)
        var ws = getSheet(ss, data.table)
        var name = data.column
        validateString("Column Name", name)
        validateUniqueColumn(ws, name)
        var type = data.dataType
        validateString("Column type", type)
        validateDataType(type)
        var required = data.required
        validateBoolean("Column required", required)
        var nextColumnIndex = ws.getLastColumn() + 1
        DataTypes[type.toLowerCase()].formatColumn(ws, nextColumnIndex, name, required)
        return { message: `Created column ${name}` }
    }

    /*
    {
        key: ********************,
        action: create,
        type: entry,
        table: Users
        entry: { username: Jimmy, age: 44, isMember: true }
    }
    */

    function createEntry(ss, data) {
        validateString("Table name", data.table)
        var ws = getSheet(ss, data.table)
        var entry = data.entry
        var headerDetails = getHeaderDetails(ws)
        if (entry.id) {
            if (getRow(ws, entry.id + 1)[0]) {
                throw new Error("Entry with ID already exists")
            }
        } else {
            entry.id = getNextRowIndex(ws) - 1
        }
        var row = []

        for (column of headerDetails) {
            var dataType = DataTypes[column.dataType]
            var required = column.required
            var value = findMatchingValue(entry, column.name)
            dataType.validate(column.name, value, required)
            if (column.dataType == "json") {
                try {
                    value = JSON.stringify(value)
                } catch (error) {
                    console.log(error)
                }
            }
            row.push(value)
        }

        setRow(ws, entry.id + 1, row)

        return {
            message: `Successfully Created entry`,
            entry: entry,
        }
    }

    function findMatchingValue(entry, columnName) {
        var matchingKey = Object.keys(entry).find(
            (key) => key.toLowerCase() == columnName.toLowerCase()
        )
        return matchingKey ? entry[matchingKey] : null
    }

    /*
    {
        key: ***********************,
        action: read,
        type: database
    }
    */

    function readDatabase(ss, data) {
        const name = ss.getName()
        const sheets = ss.getSheets()
        const tables = sheets.map((ws) => {
            const tableName = ws.getName()
            const columns = getHeaderDetails(ws)
            const size = getEntryCount(ws)
            return {
                name: tableName,
                columns: columns ? columns : [],
                size: size ? size : 0,
            }
        })
        const size = tables.reduce((acc, table) => acc + table.size, 0)

        return {
            name: name,
            key: ss.getId(),
            tables: tables,
            size: size,
        }
    }

    function getEntryCount(ws) {
        const column = getColumn(ws, 1)
        column.shift()
        var count = 0
        console.log(`Column`)
        console.log(column)
        for (row of column) {
            if (row) {
                count++
            }
        }
        return count
    }

    /*
    {
        key: ***********************,
        action: read,
        type: table,
        table: Customers,
        columnInfo: false,
        page: 1,
        limit: 5,
        include: {"Last Name" : ["", ""], Age: 44},
        exclude: {"id": [1, 2, 3, 4]},
        list: true,
        sortby: columnName,
        ascending: true,
    }
    */

    function readTable(ss, data) {
        var name = data.table
        validateString("Table name", name)
        var ws = getSheet(ss, name)

        var startIndex = 0
        var endIndex = ws.getLastRow()

        if (data.page != null && data.limit != null) {
            startIndex = (data.page - 1) * data.limit
            endIndex = data.page * data.limit
        }

        if (data.include) {
            validateObject("Include data", data.include)
            for (var key in data.include) {
                validateExistingColumn(ws, key)
            }
        }

        if (data.exclude) {
            validateObject("Exclude data", data.exclude)
            for (var key in data.exclude) {
                validateExistingColumn(ws, key)
            }
        }

        if (data.sortBy) {
            data.sortColumn = getColumnIndex(ws, data.sortBy)
            if (data.ascending != null) {
                validateBoolean("Ascending", data.ascending)
            } else {
                data.ascending = true
            }
        }

        var output = { name: ws.getName(), size: ws.getLastRow() - 1 }

        var columnData = getHeaderDetails(ws)

        if (data.columnInfo) {
            output.columns = columnData
        }

        output.data = getTableData(
            ws,
            columnData,
            startIndex,
            endIndex,
            data.list,
            data.include,
            data.exclude,
            data.sortColumn,
            data.ascending
        )

        return output
    }

    function getTableData(
        ws,
        columnData,
        start,
        end,
        list,
        include,
        exclude,
        sortColumn,
        ascending
    ) {
        const lastRow = ws.getLastRow()

        // Check if there are no data rows
        if (lastRow <= 1) {
            return list ? [] : [[]] // Return empty array or array with empty row
        }

        const range = ws.getRange(2, 1, lastRow - 1, ws.getLastColumn())
        var rows = sortColumn ? sortRange(range, sortColumn, ascending) : range.getValues()
        const headerRow = getRow(ws, 1)

        const jsonCols = columnData.filter((c) => c.dataType == "json")

        for (var row of rows) {
            for (var col of jsonCols) {
                var data = row[col.index - 1]
                try {
                    var parsed = JSON.parse(data)
                    row[col.index - 1] = parsed
                } catch (error) {
                    console.log(error)
                }
            }
        }

        if (!include && !exclude) {
            rows = rows.slice(start, end)
            return list ? rows : rows.map((row) => createObject(headerRow, row))
        }

        var filteredRows = rows.filter((row) => {
            return headerRow.every((columnName, columnIndex) => {
                const value = row[columnIndex]
                const includeValues = include?.[columnName]
                const excludeValues = exclude?.[columnName]

                const includeMatch =
                    !includeValues ||
                    (Array.isArray(includeValues)
                        ? includeValues.includes(value)
                        : includeValues === value)
                const excludeMatch =
                    excludeValues &&
                    (Array.isArray(excludeValues)
                        ? excludeValues.includes(value)
                        : excludeValues === value)

                return includeMatch && !excludeMatch
            })
        })

        filteredRows = filteredRows.slice(start, end)
        return list ? filteredRows : filteredRows.map((row) => createObject(headerRow, row))
    }

    function createObject(keys, values) {
        var obj = {}
        keys.forEach((value, index) => {
            obj[value] = values[index]
        })
        return obj
    }

    function sortRange(range, sortColumn, ascending) {
        var originalData = range.getValues()
        var sortedData = range.sort({ column: sortColumn, ascending: ascending }).getValues()
        range.setValues(originalData)
        return sortedData
    }

    /*
    {
        key: ********************,
        action: read,
        type: column,
        table: Customers
        column: Age,
    }
    */

    function readColumn(ss, data) {
        validateString("Table name", data.table)
        var ws = getSheet(ss, data.table)
        validateString("Column", data.column)
        var columnIndex = getColumnIndex(ws, data.column)
        var columnData = getColumn(ws, columnIndex)
        var columnHeader = columnData.shift()

        var headerData = getHeaderDetails(ws)[columnIndex - 1]

        if (headerData.dataType == "json") {
            for (row in columnData) {
                var value = columnData[row]
                try {
                    var parsed = JSON.parse(value)
                    columnData[row] = parsed
                } catch (error) {
                    console.log(error)
                }
            }
        }

        return {
            column: columnHeader,
            header: headerData,
            data: columnData,
        }
    }

    /*
    {
        key: ********************,
        action: read,
        type: entry,
        table: Users,
        id: 1,
        list: false
    }
    */

    function readEntry(ss, data) {
        validateString("Table name", data.table)
        var ws = getSheet(ss, data.table)
        var id = data.id
        validateInteger("id", id)
        validateExistingIDs(ws, [id])
        var dataRow = getRow(ws, id + 1)

        const jsonCols = getHeaderDetails(ws).filter((h) => h.dataType == "json")

        for (col of jsonCols) {
            var value = dataRow[col.index - 1]
            try {
                var parsed = JSON.parse(value)
                dataRow[col.index - 1] = parsed
            } catch (error) {
                console.log(error)
            }
        }

        if (data.list) {
            return { data: dataRow }
        }
        var headerRow = getRow(ws, 1)
        return { data: createObject(headerRow, dataRow) }
    }

    /*
    {
        key: ********************,
        action: update,
        type: database,
        name: Customers
    }
    */

    function updateDatabase(ss, data) {
        var name = data.name
        validateString("Database Name", name)
        ss.setName(name)
        return { message: `Successfully updated database ${name}` }
    }

    /*
    {
        key: ********************,
        action: update,
        type: table,
        table: Users,
        name: Customers
    }
    */

    function updateTable(ss, data) {
        var table = data.table
        validateString("Table name", table)
        var ws = getSheet(ss, table)
        var name = data.name
        validateString("New name", name)
        validateUniqueSheet(ss, name)
        ws.setName(name)
        return { message: `Successfuly updated table ${name}` }
    }

    /*
    {
        key: ********************,
        action: update,
        type: column,
        table: Customers
        column: Age,
        name: DOB,
        dataType: string,
        required: false
    }
    */

    function updateColumn(ss, data) {
        validateString("Table name", data.table)
        var ws = getSheet(ss, data.table)
        validateString("Column", data.column)
        var columnIndex = getColumnIndex(ws, data.column)
        var name = data.name
        validateString("name", name)
        ws.getRange(1, columnIndex).setValue("")
        validateUniqueColumn(ws, name)
        var type = data.dataType
        validateString("type", type)
        validateDataType(type)
        var required = data.required
        validateBoolean("required", required)
        ws.deleteColumn(columnIndex)
        ws.insertColumnBefore(columnIndex)
        DataTypes[type.toLowerCase()].formatColumn(ws, columnIndex, name, required)
        return { message: `Successfully updated column ${data.column}` }
    }

    /*
    {
        key: ********************,
        action: update,
        type: entry,
        table: Users,
        id: 1
        entry: { username: Jinme }   
    }
    */

    function updateEntry(ss, data) {
        validateString("Table name", data.table)
        const ws = getSheet(ss, data.table)
        const id = data.id
        validateExistingIDs(ws, [id])

        const headerDetails = getHeaderDetails(ws).reduce((acc, header) => {
            acc[header.name.toUpperCase()] = header
            return acc
        }, {})

        Object.entries(data.entry).forEach(([columnName, value]) => {
            const header = headerDetails[columnName.toUpperCase()]
            if (!header) {
                throw new Error(`Specified column ${columnName} does not exist`)
            }

            DataTypes[header.dataType].validate(header.name, value, header.required)
            if (header.dataType == "json") {
                try {
                    value = JSON.stringify(value)
                } catch (error) {
                    console.log
                }
            }
            ws.getRange(id + 1, header.index).setValue(value)
        })
        return { message: `Successfully updated entry ${id}` }
    }

    /*
    {
        key: ********************,
        action: delete,
        type: table,
        table: Users
    }
    */

    function deleteTable(ss, data) {
        var name = data.table
        validateString("Table name", name)
        var ws = getSheet(ss, name)
        ss.deleteSheet(ws)
        return { message: `Successfuly deleted table ${data.table}` }
    }

    /*
    {
        key: ********************,
        action: delete,
        type: column,
        table: Users,
        column: Age
    }
    */

    function deleteColumn(ss, data) {
        validateString("Table name", data.table)
        var ws = getSheet(ss, data.table)
        var name = data.column
        if (name.toLowerCase() == "id") {
            throw new VaultGSError(`Cannot delete id column`, 400)
        }
        validateString("Column Name", name)
        var index = getColumnIndex(ws, name)
        ws.deleteColumn(index)
        return { message: `Successfully deleted column ${data.column}` }
    }

    /*
    {
        key: ********************,
        action: delete,
        type: entry,
        table: Users,
        id: 1
    }
    */

    function deleteEntry(ss, data) {
        validateString("Table name", data.table)
        var ws = getSheet(ss, data.table)
        var id = data.id
        validateExistingIDs(ws, [id])
        clearRow(ws, id + 1)
        return { message: `Successfully deleted entry ${id}` }
    }

    var POSTCommands = {
        create: {
            table: createTable,
            column: createColumn,
            entry: createEntry,
        },
        read: {
            database: readDatabase,
            table: readTable,
            column: readColumn,
            entry: readEntry,
        },
        update: {
            database: updateDatabase,
            table: updateTable,
            column: updateColumn,
            entry: updateEntry,
        },
        delete: {
            table: deleteTable,
            column: deleteColumn,
            entry: deleteEntry,
        },
    }

    function doPost({ postData }) {
        try {
            validatePostData(postData)
            var contents = parseJSON(postData.contents)

            validateData("Spreadsheet Key", contents.key)
            var ss = SpreadsheetApp.openById(contents.key)

            var action = contents.action
            validateString("Action", action)
            var command = POSTCommands[action.toLowerCase()]
            if (!command) {
                throw new VaultGSError(`Command not recognized: ${action}`, 400)
            }

            var type = contents.type
            validateString("Type", type)
            var subCommand = command[type.toLowerCase()]
            if (!subCommand) {
                throw new VaultGSError(`Type not recognized: ${type}`, 400)
            }

            return outputJSON(subCommand(ss, contents))
        } catch (error) {
            return handleError(error)
        }
    }

    function getPostContents(postData) {
        try {
            validatePostData(postData)
            var contents = parseJSON(postData.contents)
            return contents
        } catch (error) {
            throw new Error(`Error getting contents: ${error.message}`)
        }
    }

    class VaultGSError extends Error {
        constructor(message, errorCode) {
            super(message)
            this.errorCode = errorCode
        }
    }

    const DataTypes = {
        integer: {
            bg: "#073763",
            fg: "#cfe2f3",
            formatColumn(ws, index, name, required) {
                var letter = columnToLetter(index)
                formatColumn(
                    ws,
                    index,
                    name,
                    required,
                    this.bg,
                    this.fg,
                    `=(ISNUMBER(${letter}2:${letter}) * (INT(${letter}2:${letter}) = ${letter}2:${letter}))`
                )
            },
            validate(name, data, required) {
                if (!required && data == null) return
                validateInteger(name, data)
            },
        },
        float: {
            bg: "#fce5cd",
            fg: "#783f04",
            formatColumn(ws, index, name, required) {
                var letter = columnToLetter(index)
                formatColumn(
                    ws,
                    index,
                    name,
                    required,
                    this.bg,
                    this.fg,
                    `=ISNUMBER(${letter}2:${letter})`
                )
            },
            validate(name, data, required) {
                if (!required && data == null) return
                validateFloat(name, data)
            },
        },
        boolean: {
            bg: "#f4cccc",
            fg: "#660000",
            formatColumn(ws, index, name, required) {
                formatColumn(ws, index, name, required, this.bg, this.fg, null)
            },
            validate(name, data, required) {
                if (data == null) return
                validateBoolean(name, data)
            },
        },
        string: {
            bg: "#d9ead3",
            fg: "#274e13",
            formatColumn(ws, index, name, required) {
                ws.setColumnWidth(index, 300)
                formatColumn(ws, index, name, required, this.bg, this.fg).setNumberFormat("@")
            },
            validate(name, data, required) {
                if (!required && data == null) return
                validateString(name, data)
            },
        },
        json: {
            bg: "#d9d2e9",
            fg: "#20124d",
            formatColumn(ws, index, name, required) {
                ws.setColumnWidth(index, 300)
                formatColumn(ws, index, name, required, this.bg, this.fg).setNumberFormat("@")
            },
            validate(name, data, required) {
                if (!required && data == null) return
                validateJSON(name, JSON.stringify(data))
            },
        },
    }

    function formatColumn(ws, index, name, required, bg, fg, formula = null) {
        var range = ws.getRange(1, index)
        range
            .setValue(name)
            .setBackgroundColor(bg)
            .setFontColor(fg)
            .setFontWeight(required ? "bold" : "normal")
        var letter = columnToLetter(index)
        range = ws.getRange(`${letter}2:${letter}`)
        if (formula) {
            var rule = SpreadsheetApp.newDataValidation()
                .requireFormulaSatisfied(formula)
                .setAllowInvalid(false)
                .build()
            range.setDataValidation(rule)
        }
        return range
    }

    function getHeaderDetails(sheet) {
        const lastColumn = sheet.getLastColumn()

        if (lastColumn === 0 && sheet.getRange(1, 1).getValue() === "") {
            // Sheet is empty, return an empty array
            return []
        }

        const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn()) // Including the first column
        const headerValues = headerRange.getValues()[0] // Get the text of the headers
        const headerBackgrounds = headerRange.getBackgrounds()[0] // Get the background colors of the headers
        const headerFontWeights = headerRange.getFontWeights()[0] // Get the font weights of the headers

        // Create an array of objects, each containing the column name, column index, background color, data type, and required flag
        const headerDetails = headerValues.map((value, index) => {
            return {
                name: value,
                index: index + 1, // Adjusting column index to start from 1
                dataType: getDataTypeFromBackgroundColor(headerBackgrounds[index]), // Call function to get data type
                required: headerFontWeights[index] === "bold", // Set required flag based on font weight
            }
        })

        return headerDetails
    }

    function getDataTypeFromBackgroundColor(bgColor) {
        for (const dataType in DataTypes) {
            if (DataTypes[dataType].bg === bgColor) {
                return dataType
            }
        }
        // Return default data type if no match found
        throw new VaultGSError(`No DataType matches bg:${bgColor}`)
    }

    function formatSheet(ws) {
        ws.setFrozenRows(1)
        ws.getRange("1:50500")
            .setFontFamily("Consolas")
            .setFontSize(16)
            .setWrap(true)
            .setHorizontalAlignment("left")
            .setVerticalAlignment("top")
            .applyRowBanding(SpreadsheetApp.BandingTheme.GREY)

        ws.getRange("1:1")
            //.setFontWeight("bold")
            .setHorizontalAlignment("center")
            .setVerticalAlignment("middle")
    }

    function getNextRowIndex(ws) {
        var idColumn = getColumn(ws, 1)
        var lastRow = idColumn.findIndex((value) => value == "") + 1
        return lastRow == 0 ? ws.getLastRow() + 1 : lastRow
    }

    function getNextRowIndices(ws, numIndices) {
        var idColumn = getColumn(ws, 1)
        var lastRow = ws.getLastRow()
        var freeIndices = []

        for (var i = 2; i <= lastRow && freeIndices.length < numIndices; i++) {
            if (idColumn[i - 1] === "") {
                freeIndices.push(i)
            }
        }

        if (freeIndices.length < numIndices) {
            // If there are not enough free spots, return indices at the end
            for (var j = lastRow + 1; j <= lastRow + numIndices - freeIndices.length; j++) {
                freeIndices.push(j)
            }
        }

        return freeIndices
    }

    function isRowEmpty(ws, index) {
        var idColumn = getColumn(ws, 1)
        return index - 1 >= idColumn.length || idColumn[index - 1] === ""
    }

    function areRowsEmpty(ws, indices) {
        var idColumn = getColumn(ws, 1)
        var lastRowIndex = idColumn.length
        return indices.map((index) => index - 1 >= lastRowIndex || idColumn[index - 1] === "")
    }

    function getRow(ws, index) {
        var lastColumn = ws.getLastColumn()
        if (lastColumn < 1) {
            return []
        }
        const [rowValues] = ws.getRange(index, 1, 1, lastColumn).getValues()
        return rowValues
    }

    function getColumn(ws, index) {
        var lastRow = ws.getLastRow()
        if (lastRow < 1) {
            return []
        }
        const columnValues = ws.getRange(1, index, lastRow, 1).getValues()
        return columnValues.flat()
    }

    function clearRow(ws, index) {
        var lastColumn = ws.getLastColumn()
        var range = ws.getRange(index, 1, 1, lastColumn)
        var emptyValues = new Array(lastColumn).fill("")
        range.setValues([emptyValues])
    }

    function setRow(ws, index, values) {
        var lastColumn = values.length
        return ws.getRange(index, 1, 1, lastColumn).setValues([values])
    }

    function setColumn(ws, index, values) {
        var lastRow = values.length
        return ws.getRange(1, index, lastRow, 1).setValues(values.map((value) => [value]))
    }

    function insertColumn(ws, values) {
        var nextColumnIndex = ws.getLastColumn() + 1
        return setColumn(ws, nextColumnIndex, values)
    }

    function clearColumn(ws, index) {
        ws.deleteColumn(index)
        ws.insertColumnBefore(index)
    }

    function insertRow(ws, values) {
        var nextRowIndex = this.sheet.getLastRow() + 1
        return this.setRow(nextRowIndex, values)
    }

    function columnToLetter(n) {
        l = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        return n > 26 ? colToLetter(Math.floor((n - 1) / 26)) + colToLetter(n % 26) : l[n - 1]
    }

    function getSheet(ss, sheetName) {
        validateExistingSheet(ss, sheetName)
        return ss
            .getSheets()
            .find((sheet) => sheet.getName().toUpperCase() == sheetName.toUpperCase())
    }

    function handleError(caughtError) {
        if (caughtError instanceof VaultGSError) {
            return outputJSON({ error: caughtError.message }, caughtError.errorCode)
        } else {
            return outputJSON(
                {
                    error: `Unexpected error occured: ${caughtError}`,
                },
                500
            )
        }
    }

    function parseJSON(data) {
        try {
            return JSON.parse(data)
        } catch (error) {
            throw new VaultGSError(`Error parsing JSON`, 400)
        }
    }

    function getColumnIndex(ws, columnName) {
        validateExistingColumn(ws, columnName)
        return getRow(ws, 1).findIndex((col) => col.toUpperCase() == columnName.toUpperCase()) + 1
    }

    function outputJSON(data, status = 200) {
        data.status = status
        return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
            ContentService.MimeType.JSON
        )
    }

    function doesSheetExist(ss, sheetName) {
        return ss
            .getSheets()
            .some((sheet) => sheet.getName().toUpperCase() == sheetName.toUpperCase())
    }

    function validateUniqueSheet(ss, sheetName) {
        if (doesSheetExist(ss, sheetName)) {
            throw new VaultGSError(`Sheet with name ${sheetName} already exists`, 400)
        }
        return true
    }

    function validateExistingSheet(ss, sheetName) {
        if (!doesSheetExist(ss, sheetName)) {
            throw new VaultGSError(`Sheet with name ${sheetName} does not exist`, 400)
        }
        return true
    }

    function doesColumnExist(ws, columnName) {
        return getRow(ws, 1).some((col) => col.toUpperCase() == columnName.toUpperCase())
    }

    function validateUniqueColumn(ws, columnName) {
        if (doesColumnExist(ws, columnName)) {
            throw new VaultGSError(`Column with name ${columnName} already exists`, 400)
        }
        return true
    }

    function validateExistingColumn(ws, columnName) {
        if (!doesColumnExist(ws, columnName)) {
            throw new VaultGSError(`Column with name ${columnName} does not exist`, 400)
        }
        return true
    }

    function isValidDataType(typeName) {
        return Object.keys(DataTypes).some((d) => d.toUpperCase() == typeName.toUpperCase())
    }

    function validateDataType(typeName) {
        if (!isValidDataType(typeName)) {
            throw new VaultGSError(`Type ${typeName} is not recognized`, 400)
        }
        return true
    }

    function validateData(name, data) {
        if (!data) {
            throw new VaultGSError(`${name} not specified`, 400)
        }
        return true
    }

    function validateString(name, data) {
        if (typeof data != "string") {
            throw new VaultGSError(`${name} must be a valid string: ${data}`, 400)
        }
        return validateArray(name, data)
    }

    function validateJSON(name, data) {
        try {
            JSON.parse(data)
        } catch (e) {
            throw new VaultGSError(`${name} is not valid JSON`, 400)
        }
    }

    function validateInteger(name, data) {
        if (!Number.isInteger(data)) {
            throw new VaultGSError(`${name} must be a valid integer`, 400)
        }
        return true
    }

    function validateFloat(name, data) {
        if (typeof data != "number") {
            throw new VaultGSError(`${name} must be a valid integer`, 400)
        }
        return true
    }

    function validateBoolean(name, data) {
        if (typeof data != "boolean") {
            throw new VaultGSError(`${name} must be a valid boolean`, 400)
        }
        return true
    }

    function validateArray(name, data) {
        validateData(name, data)
        if (data.length < 1) {
            throw new VaultGSError(`No ${name} specified`, 400)
        }
        return true
    }

    function validateObject(name, data) {
        validateData(name, data)

        if (Object.keys(data).length < 1) {
            throw new VaultGSError(`No ${name} specified`, 400)
        }

        return true
    }

    function validatePostData(postData) {
        if (!postData || typeof postData.contents === "undefined") {
            throw new VaultGSError("Empty request body", 400)
        }
        return true
    }

    function validateID(index) {
        if (index < 1) {
            throw new VaultGSError(`Id cannot be less than 1`, 400)
        }
        return true
    }

    function validateEmptyIDs(ws, ids) {
        var idColumn = getColumn(ws, 1)

        for (id of ids) {
            validateID(id)
            if (id <= idColumn.length && idColumn[id - 1] !== "") {
                throw new VaultGSError(`Entry id:${id} is not empty`, 400)
            }
        }
        return true
    }

    function validateExistingIDs(ws, ids) {
        var idColumn = getColumn(ws, 1)

        for (id of ids) {
            validateID(id)
            if (id > idColumn.length) {
                throw new VaultGSError(`Entry id:${id} does not exist`, 400)
            }
            if (idColumn[id] === "") {
                throw new VaultGSError(`Entry id:${id} does not exist`, 400)
            }
        }
        return true
    }

    return {
        doPost,
        getPostContents,
        evaluate(body) {
            try {
                validateData("Spreadsheet Key", body.key)
                const ss = SpreadsheetApp.openById(body.key)

                const action = body.action
                validateString("Action", action)
                const command = POSTCommands[action.toLowerCase()]
                if (!command) {
                    throw new VaultGSError(`Command not recognized: ${action}`, 400)
                }

                const type = body.type
                validateString("Type", type)
                const subCommand = command[type.toLowerCase()]
                if (!subCommand) {
                    throw new VaultGSError(`Type not recognized: ${type}`, 400)
                }

                return subCommand(ss, body)
            } catch (error) {
                if (error instanceof VaultGSError) {
                    throw new Error(error.message)
                } else {
                    throw new Error(`Unexpected error occurred : ${error}`)
                }
            }
        },
    }
})()

function EVALUATE(data) {
    return VaultGS.evaluate(data)
}


function doPost(e) {
    return VaultGS.doPost(e)
}
