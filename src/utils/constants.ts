export namespace LibSdbConstants {
    export const ScopeTypes: {[scope: string]: {name: string, frame: number}} = {
        local: {
            name: "Local Function",
            frame: 0
        },
        state: {
            name: "Contract State",
            frame: 1
        },
        global: {
            name: "VM Global",
            frame: 2
        },
        dev: {
            name: "Dev Variables",
            frame: 3
        }
    }
}