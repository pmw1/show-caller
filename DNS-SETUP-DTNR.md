# DNS Setup for DTNR.COM

## Option 1: If DTNR.COM is Already on Cloudflare

No additional DNS setup needed! Just deploy:
```bash
./DEPLOY-DTNR.sh
```

The route will automatically work at: **https://calls.dtnr.com**

## Option 2: If DTNR.COM is NOT on Cloudflare

Add this DNS record to your DNS provider:

```
Type: CNAME
Name: calls
Value: liftover-queue.workers.dev
TTL: Auto/300
```

## Option 3: Use the Entire Domain

If you want the app at **https://dtnr.com** (not subdomain):

1. Edit `cloudflare-simple/wrangler.toml`:
```toml
[[routes]]
pattern = "dtnr.com/*"
zone_name = "dtnr.com"
```

2. Deploy:
```bash
./DEPLOY-DTNR.sh
```

## Testing Your Setup

After deployment and DNS setup:

1. **Test the caller page:**
   ```
   curl https://calls.dtnr.com/
   ```

2. **Test the API:**
   ```
   curl https://calls.dtnr.com/api/queue
   ```

3. **Check DNS propagation:**
   ```
   nslookup calls.dtnr.com
   ```

## URLs After Setup

- **Callers Join:** https://calls.dtnr.com
- **Operator Dashboard:** https://calls.dtnr.com/operator
- **API Status:** https://calls.dtnr.com/api/queue

## Troubleshooting

If `calls.dtnr.com` doesn't work immediately:
1. DNS propagation can take 5-30 minutes
2. Try clearing browser cache
3. Test with: `curl -I https://calls.dtnr.com`

## For Production

Consider adding:
- Password protection on `/operator`
- Rate limiting on `/api/join`
- Custom error pages
- Analytics tracking