
export class EnumDefinition {
    public name: string;
    public values: string[];

    constructor(name: string) {
        this.name = name;
        this.values = [];
    }

    public clone(): EnumDefinition {
        let clone = new EnumDefinition(this.name);

        for (let i = 0; i < this.values.length; i++) {
            clone.values.push(this.values[i]);
        }

        return clone;
    }
}