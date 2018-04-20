export namespace LibSdbConstants {
    export const ScopeTypes: {[scope: string]: {name: string, frame: number}} = {
        local: {
            name: "Local Function",
            frame: 1
        },
        state: {
            name: "Contract State",
            frame: 2
        },
        global: {
            name: "VM Global",
            frame: 3
        },
        dev: {
            name: "Dev Variables",
            frame: 4
        },
        variableStart: { // NOTE: variableStart must have a frame number larger than other scopes in this type
            name: "unused",
            frame: 5
        }
    }
}