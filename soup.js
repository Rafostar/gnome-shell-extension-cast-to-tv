const { Soup } = imports.gi;

class SoupServer extends Soup.Server
{
	constructor(port)
	{
		super({ port: port });
		this.run_async();

		this.parseMessage = (msg) =>
		{
			let result = null;

			try { result = JSON.parse(msg.request_body.data); }
			catch(err) {}

			return result;
		}
	}
}
