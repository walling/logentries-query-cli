> Command-line tool to stream logs from Logentries

This tool enables you to query log records in Logentries emitted as lines that you can further process by other command-line tools. Example:

```bash
logentries-query --log=my_log --time=20min '/error/i' | grep http_status
```

### Content

- [Install](#install)
- [Initial Setup](#initial-setup)
- [API](#api)
- [Command-line arguments](#command-line-arguments)
  - [log](#log)
  - [time](#time)
  - [start](#start)
  - [end](#end)
  - [utc](#utc)
  - [format](#format)
  - [show-time](#show-time)
  - [log-name](#log-name)
  - [no-log-name](#no-log-name)
  - [limit](#limit)
- [Alias](#alias)
- [License](#license)


### Install

To install globally:

```bash
npm install -g logentries-query-stream
```

The command is called `logentries-query`. You can optionally [setup an alias](#alias).


### Initial Setup

Before using it, you have to configure the accounts and logs you want to access. In your home directory, you should create a folder named `.logentries-query-cli` with a file called `config.json`. If in doubt of the path, the command-line tool will output the absolute path, the first time it is run.

The config file should look like this:

```json
{
    "accounts" : {
        "00000000-0000-0000-0000-000000000000" : {
            "My_Log_Set" : {
                "my_log_1" : "foo",
                "my_log_2" : "bar",
                "my_log_3" : true
            },
            "Another_Log_Set" : {
                "my_log_4" : true,
                "my_log_5" : "baz",
                "my_log_6" : false
            }
        }
    }
}
```

The `accounts` object holds each Account Key (you find it in the user settings dashboard). Under each account key, you have log sets (either the UUID or exact name). An under each log set, you have logs (either the UUID or exact name). Each log can be assigned an alias. If you specify `true`, it will use the name of the log. If you specify `false`, the log will not be included. This can be used to temporarily disable logs.

In the above example you can access `my_log_1` as **foo**, `my_log_2` as **bar**, `my_log_5` as **baz**, `my_log_3`/`my_log_4` under their own names, and `my_log_6` is not available. If in doubt, you can run the tool without any arguments, to list the configured logs.

The config allows you to specify multiple accounts, multiple log sets, and multiple logs. However the minimum requirement is to just specify a single log.


### API

If you want to query logs in a Node.js project, check out [the `logentries-query-stream` module](https://www.npmjs.com/package/logentries-query-stream). This command-line tool is built on that module.


### Command-line arguments

Here are the supported command line arguments.


#### log

The `--log=alias` argument specifies which logs to query. You can specify one or more logs. Example:

```bash
logentries-query --log=foo --log=bar 'query'
```


#### time

The `--time` argument specifies a duration to search for. On its own it searches back in time until now. For example `--time=3d` searches 3 days back in time, whereas `--time=30sec` searches 30 seconds back in time. Example:

```bash
logentries-query --log=foo --log=bar --time=14d 'query'
```

The duration is [parsed using `parse-duration` module](https://www.npmjs.com/package/parse-duration#parsestr), which supports many units.

If you also specify `--start` and/or `--end` arguments, the behavior changes slightly to define the full duration (either from start or until end). Example:

```bash
logentries-query --log=foo --log=bar --start=2017-06-12 --time=3d 'query'
```


#### start

The `--start` argument specifies a start time to search from. The format can be anything that [`moment` supports](https://momentjs.com/docs/#/parsing/string/).

Together with `--time` this specifies an actual duration (from `start` plus `time`). Example:

```bash
logentries-query --log=foo --log=bar --start=2017-06-12 --time=3d 'query'
```


#### end

The `--end` argument specifies an end time to search until. The format can be anything that [`moment` supports](https://momentjs.com/docs/#/parsing/string/).

Together with `--time` this specifies an actual duration (for `time` until `end`). Example:

```bash
logentries-query --log=foo --log=bar --time=3d --end=2017-06-15 'query'
```

You can fix the range by combinding `--start` and `--end` like this:

```bash
logentries-query --log=foo --log=bar --start=2017-06-12 --end=2017-06-15 'query'
```


#### utc

The `--utc` argument forces all timestamps to be UTC time. This means the parsing of timestamps defaults to UTC as well as outputting timestamps.


#### format

The `--format` argument specifies how to output the log records. The default format to use is `%m`. However you can display the timestamp by using `--show-time`. Example:

```bash
logentries-query --log=foo --log=bar --format='[%t] %m (%S/%L)' 'query'
```

Available specifiers:

- `%m` - message of the log record
- `%t` - timestamp when the log record was received
- `%l` - log name (alias)
- `%L` - log name from Logentries
- `%S` - log set name
- `%A` - account key


#### show-time

The `--show-time` argument shows the timestamp for each log record. This changes the default output format to `%t %m`. However if you specify a custom format, this argument does not have any impact.


#### log-name

The `--log-name` argument shows the log name of each log record. This is the default if querying multiple logs. However, with this argument you can always enable it.


#### no-log-name

The `--no-log-name` argument suppresses the log name to be automatically shown. In case you query multiple logs, the default is to include the log name. However, with this argument you can always disable it.


#### limit

The `--limit` argument specifies the maximum number of records to return for each log. This can lead to a more efficient query time.


### Alias

If you use this tool a lot, you can set up an alias, like this (in your `.bashrc`/`.zshrc`/etc.):

```bash
alias lq=logentries-query
```

You can also define aliases to query specific logs:

```bash
alias lq-mylog='logentries-query --log=my_log'
```


### License

Code is licensed under MIT, please see [license.md file](license.md) for details.
