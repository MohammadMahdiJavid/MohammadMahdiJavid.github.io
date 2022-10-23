---
layout: posts
title: Creating SOCKS5 Proxy to bypass Censorship
---

## Requirements
- a *Client* which can be your **Phone, PC, or any other device**.  
> Note: `Connected to Intranet`
- Device which is connected to **Internet** but still has **a layer of censorship**.  
> Note: `Connected to Internet with Censorship`
- Device which is connected to **Internet** and has **no censorship**.
> Note: `Connected to Internet with no Censorship`
- **SSH**  
- [**Dante**](https://www.inet.no/dante/ "Dante - A free SOCKS server")
- [**Proxifier**](https://www.proxifier.com/ "Proxy Client")

```sh
ssh -N -v -L [Source IP]:[Source Port]:[Destination IP]:[Destination Port] [Username]@[Server IP Address or Domain Name]
```

> Hint: `Instead of using IP Address, you can use Domain Name`
> Hint: `You can use any port you want for Source Port and Destination Port`


```sh
ssh -C -N -v -D [Destination IP]:9101 ubuntu@194.5.207.33
```

